import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/chat/route";
import type { KitClient } from "@/kit/chat";
import { dependencies } from "@/kit/client";

const original = dependencies.client;
afterEach(() => {
  dependencies.client = original;
  vi.unstubAllEnvs();
});

const fake = (reply: string, seen: { system?: string }[] = []): KitClient => ({
  messages: {
    stream: (p: { system: { text: string }[] }) => {
      seen.push({ system: p.system[0].text });
      return {
        async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text: reply } }; },
        finalMessage: async () => ({ stop_reason: "end_turn" }),
      };
    },
  },
} as unknown as KitClient);

const request = (body: unknown, ip = "9.9.9.9") =>
  new Request("http://staging.test/api/chat", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
  });

describe("POST /api/chat", () => {
  it("is unavailable without an API key", async () => {
    dependencies.client = () => null;
    const res = await POST(request({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(503);
  });

  it("streams server-sent events ending in done, grounded in the catalogue", async () => {
    const seen: { system?: string }[] = [];
    dependencies.client = () => fake("Hi, how can I help?", seen);
    const res = await POST(request({ messages: [{ role: "user", content: "hi" }], page: "catalogue" }, "1.1.1.1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain('data: {"type":"delta","text":"Hi, how can I help?"}');
    expect(body.trim().endsWith('data: {"type":"done"}')).toBe(true);
    expect(seen[0].system).toContain("THE OVEN CATALOGUE");
  });

  it("uses the product prompt for the G3101 page", async () => {
    const seen: { system?: string }[] = [];
    dependencies.client = () => fake("ok", seen);
    await (await POST(request({ messages: [{ role: "user", content: "hi" }], page: "product" }, "2.2.2.2"))).text();
    expect(seen[0].system).not.toContain("THE OVEN CATALOGUE");
  });

  it("rejects bad JSON, empty conversations and ones that do not end with the visitor", async () => {
    dependencies.client = () => fake("x");
    expect((await POST(request("{not json", "3.3.3.3"))).status).toBe(400);
    expect((await POST(request({ messages: [] }, "3.3.3.3"))).status).toBe(400);
    expect((await POST(request({}, "3.3.3.3"))).status).toBe(400);
    expect((await POST(request({ messages: [{ role: "assistant", content: "hello" }] }, "3.3.3.3"))).status).toBe(400);
  });

  it("limits one visitor to 80 messages an hour, and counts visitors separately", async () => {
    dependencies.client = () => fake("x");
    const send = (ip?: string) => POST(request({ messages: [{ role: "user", content: "hi" }] }, ip));
    for (let i = 0; i < 80; i++) expect((await send("4.4.4.4")).status).toBe(200);
    expect((await send("4.4.4.4")).status).toBe(429);
    expect((await send("5.5.5.5")).status).toBe(200);
  });

  it("treats a request with no forwarding header as one anonymous visitor", async () => {
    dependencies.client = () => fake("x");
    const res = await POST(new Request("http://staging.test/api/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }));
    expect(res.status).toBe(200);
  });
});

describe("the real client", () => {
  it("is built only when an API key is configured", () => {
    expect(original()).toBeNull();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(original()).not.toBeNull();
  });
});
