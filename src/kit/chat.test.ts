import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanMessages, PHONE_FALLBACK, REFUSAL, streamReply, systemFor, type ChatEvent, type KitClient } from "@/kit/chat";
import { PRODUCT_FACTS, SYSTEM_PROMPT } from "@/kit/knowledge";

const MODELS = { primary: "big", fallback: "small" };
const noWait = () => Promise.resolve();
const user = (content: string) => ({ role: "user" as const, content });

const text = (t: string) => ({ type: "content_block_delta", delta: { type: "text_delta", text: t } });

// A client whose successive calls behave as scripted: each step streams events then ends, or throws.
function scripted(...steps: ({ events: unknown[]; stop?: string | null } | { throws: Error })[]) {
  const calls: { model: string }[] = [];
  let i = 0;
  const client = {
    messages: {
      stream: (params: { model: string }) => {
        calls.push({ model: params.model });
        const step = steps[Math.min(i++, steps.length - 1)];
        if ("throws" in step) throw step.throws;
        return {
          async *[Symbol.asyncIterator]() { yield* step.events as never[]; },
          finalMessage: async () => ({ stop_reason: step.stop ?? "end_turn" }),
        };
      },
    },
  } as unknown as KitClient;
  return { client, calls };
}

const collect = async (gen: AsyncGenerator<ChatEvent>) => {
  const out: ChatEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
};

afterEach(() => vi.restoreAllMocks());

describe("cleanMessages", () => {
  it("keeps well-formed user and assistant turns, trims them to size and keeps the latest", () => {
    expect(cleanMessages("nope")).toEqual([]);
    expect(cleanMessages([null, { role: "system", content: "x" }, { role: "user", content: "   " }, { role: "user", content: 5 }])).toEqual([]);
    expect(cleanMessages([user("hello"), { role: "assistant", content: "hi" }])).toHaveLength(2);
    expect(cleanMessages([user("x".repeat(5000))])[0].content).toHaveLength(4000);
    const many = Array.from({ length: 40 }, (_, i) => user(`m${i}`));
    const kept = cleanMessages(many);
    expect(kept).toHaveLength(24);
    expect(kept.at(-1)!.content).toBe("m39");
  });
});

describe("systemFor", () => {
  it("uses the single-product prompt on the G3101 page", () => {
    expect(systemFor("product")).toBe(SYSTEM_PROMPT);
  });

  it("swaps the product facts for the catalogue everywhere else", () => {
    for (const page of ["catalogue", "ovens", "6-burner", undefined]) {
      const prompt = systemFor(page);
      expect(prompt).not.toContain(PRODUCT_FACTS);
      expect(prompt).toContain("THE OVEN CATALOGUE");
    }
  });
});

describe("streamReply", () => {
  it("streams text and finishes", async () => {
    const { client, calls } = scripted({ events: [text("Hel"), { type: "ping" }, text("lo")] });
    expect(await collect(streamReply(client, "sys", [user("hi")], MODELS, noWait))).toEqual([
      { type: "delta", text: "Hel" }, { type: "delta", text: "lo" }, { type: "done" },
    ]);
    expect(calls).toEqual([{ model: "big" }]);
  });

  it("ignores deltas that carry no text", async () => {
    const { client } = scripted({ events: [{ type: "content_block_delta", delta: { type: "input_json_delta" } }, { type: "content_block_delta", delta: { type: "text_delta", text: "" } }, { type: "content_block_delta" }] });
    expect(await collect(streamReply(client, "sys", [user("hi")], MODELS, noWait))).toEqual([{ type: "done" }]);
  });

  it("retries the same model, then falls back, and succeeds quietly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const waits: number[] = [];
    const { client, calls } = scripted({ throws: new Error("overloaded") }, { throws: new Error("overloaded") }, { events: [text("ok")] });
    const out = await collect(streamReply(client, "sys", [user("hi")], MODELS, async (ms) => void waits.push(ms)));
    expect(out).toEqual([{ type: "delta", text: "ok" }, { type: "done" }]);
    expect(calls.map((c) => c.model)).toEqual(["big", "big", "small"]);
    expect(waits).toEqual([900, 400]);
  });

  it("gives a phone number after every attempt has failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = scripted({ throws: new Error("down") });
    expect(await collect(streamReply(client, "sys", [user("hi")], MODELS, noWait))).toEqual([
      { type: "error", error: PHONE_FALLBACK }, { type: "done" },
    ]);
  });

  it("never starts a second reply once half of one is on screen", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      messages: {
        stream: () => ({
          async *[Symbol.asyncIterator]() { yield text("partial"); throw new Error("dropped"); },
          finalMessage: async () => ({ stop_reason: null }),
        }),
      },
    } as unknown as KitClient;
    expect(await collect(streamReply(broken, "sys", [user("hi")], MODELS, noWait))).toEqual([
      { type: "delta", text: "partial" }, { type: "done" },
    ]);
    expect(err).toHaveBeenCalledTimes(1);
  });

  it("logs non-Error failures too", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = scripted({ throws: "boom" as unknown as Error });
    await collect(streamReply(client, "sys", [user("hi")], MODELS, noWait));
    expect(err.mock.calls[0][1]).toBe("boom");
  });

  it("reports a refusal", async () => {
    const { client } = scripted({ events: [], stop: "refusal" });
    expect(await collect(streamReply(client, "sys", [user("hi")], MODELS, noWait))).toEqual([
      { type: "error", error: REFUSAL }, { type: "done" },
    ]);
  });

  it("sends the system prompt cached, with low effort", async () => {
    let seen: Record<string, unknown> = {};
    const client = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          seen = params;
          return { async *[Symbol.asyncIterator]() {}, finalMessage: async () => ({ stop_reason: "end_turn" }) };
        },
      },
    } as unknown as KitClient;
    await collect(streamReply(client, "SYSTEM", [user("hi")], MODELS, noWait));
    expect(seen.system).toEqual([{ type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } }]);
    expect(seen.output_config).toEqual({ effort: "low" });
  });

  it("waits with real timers by default", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = scripted({ throws: new Error("x") }, { events: [text("late")] });
    const run = collect(streamReply(client, "sys", [user("hi")], MODELS));
    await vi.advanceTimersByTimeAsync(1000);
    expect((await run).map((e) => e.type)).toEqual(["delta", "done"]);
    vi.useRealTimers();
  });
});
