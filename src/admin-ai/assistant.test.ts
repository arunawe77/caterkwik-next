/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are loosely typed JSON in these tests */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestState } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import { cleanMessages, runAssistant, type AssistantClient } from "@/admin-ai/assistant";
import { dependencies } from "@/admin-ai/client";
import { execute, resolvePending, TOOLS } from "@/admin-ai/tools";
import { POST as assistantRoute } from "@/app/api/admin/assistant/route";
import { POST as confirmRoute } from "@/app/api/admin/assistant/confirm/route";
import { createCategory, createProduct, type Actor } from "@/server/catalogue-admin";
import { resetCatalogueLoader } from "@/server/catalogue-store";
import { db } from "@/server/db";
import { startSession } from "@/server/session";

const staff: Actor = { id: null, name: "Sam", source: "STAFF" };
const MODELS = { primary: "primary", fallback: "fallback" };

let userId = "";
const ctx = () => ({ userId, actor: { id: null, name: "Sam via assistant", source: "AI" as const } });

beforeEach(async () => {
  await resetTestState();
  resetCatalogueLoader();
  userId = (await db.user.create({ data: { email: "a@example.com", name: "Alex", passwordHash: "x", role: "ADMIN" } })).id;
  await createCategory(staff, { slug: "fryers", label: "Fryers" });
});
afterAll(() => db.$disconnect());

type Turn = { content: object[]; stop_reason: string };
const say = (t: string): Turn => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });
const call = (name: string, input: object, id = "tu1"): Turn => ({ content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use" });

// A model that plays back a script and records what it was sent.
function scripted(turns: (Turn | Error)[]) {
  const sent: { model: string; messages: unknown[] }[] = [];
  const client = {
    messages: {
      create: vi.fn(async (p: { model: string; messages: unknown[] }) => {
        sent.push({ model: p.model, messages: structuredClone(p.messages) });
        const next = turns.shift()!;
        if (next instanceof Error) throw next;
        return next;
      }),
    },
  } as unknown as AssistantClient;
  return { client, sent };
}

describe("the assistant loop", () => {
  it("looks things up, then answers with what it found", async () => {
    await createProduct(staff, { name: "Alpha Fryer", categorySlug: "fryers", priceEx: 99 });
    const { client, sent } = scripted([call("search_products", { query: "alpha" }), say("Found one.")]);
    const out = await runAssistant(client, [{ role: "user", content: "find alpha" }], ctx(), MODELS);
    expect(out.reply).toBe("Found one.");
    expect(out.actions).toEqual([{ tool: "search_products", ok: true, note: "Looked it up" }]);
    const result = JSON.stringify((sent[1].messages.at(-1) as { content: unknown }).content);
    expect(result).toContain("Alpha Fryer");
    expect(result).toContain("\\\"priceExVat\\\":99");
  });

  it("applies a single change at once, logged as the assistant, and it can be undone", async () => {
    const p = await createProduct(staff, { name: "Beta Fryer", categorySlug: "fryers", priceEx: 100, status: "ACTIVE" });
    const { client } = scripted([call("update_product", { id: p.id, changes: { priceEx: 90 } }), say("Price now 90.")]);
    const out = await runAssistant(client, [{ role: "user", content: "drop beta to 90" }], ctx(), MODELS);
    expect(out.actions[0]).toMatchObject({ tool: "update_product", ok: true, note: "Updated Beta Fryer" });
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).priceExPence).toBe(9000);
    expect(await db.auditLog.findFirstOrThrow({ where: { action: "update" } })).toMatchObject({ source: "AI", actorName: "Sam via assistant" });

    const logId = (await db.auditLog.findFirstOrThrow({ where: { action: "update" } })).id;
    await execute("undo_change", { auditId: logId }, ctx());
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).priceExPence).toBe(10000);
  });

  it("hands a validation error back to the model instead of failing", async () => {
    const p = await createProduct(staff, { name: "Gamma Fryer", categorySlug: "fryers" });
    const { client, sent } = scripted([call("update_product", { id: p.id, changes: { status: "ACTIVE" } }), say("It needs a price first.")]);
    const out = await runAssistant(client, [{ role: "user", content: "publish gamma" }], ctx(), MODELS);
    expect(out.actions[0]).toMatchObject({ ok: false });
    expect(JSON.stringify(sent[1].messages.at(-1))).toContain("needs a price");
    expect(out.reply).toBe("It needs a price first.");
  });

  it("does not leak unexpected errors to the model, and rejects unknown tools and bad input", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = scripted([call("get_product", { id: 5 }), say("ok")]);
    const out = await runAssistant(client, [{ role: "user", content: "x" }], ctx(), MODELS);
    expect(out.actions[0].ok).toBe(false);
    await expect(execute("drop_database", {}, ctx())).rejects.toThrow(/no tool/);
    spy.mockRestore();
  });

  it("never applies a delete or a bulk change by itself", async () => {
    const a = await createProduct(staff, { name: "Delta A", categorySlug: "fryers", priceEx: 10, status: "ACTIVE" });
    const b = await createProduct(staff, { name: "Delta B", categorySlug: "fryers", priceEx: 20, status: "ACTIVE" });
    const { client } = scripted([
      { content: [
        { type: "tool_use", id: "t1", name: "delete_product", input: { id: a.id } },
        { type: "tool_use", id: "t2", name: "adjust_prices", input: { ids: [a.id, b.id], percent: -10 } },
        { type: "tool_use", id: "t3", name: "bulk_update_products", input: { ids: [a.id, b.id], changes: { status: "ARCHIVED" } } },
      ], stop_reason: "tool_use" },
      say("Proposed; waiting for you."),
    ]);
    const out = await runAssistant(client, [{ role: "user", content: "do three things" }], ctx(), MODELS);
    expect(out.pending).toHaveLength(3);
    expect(out.pending[0].summary).toBe('Permanently delete "Delta A"');
    expect(out.pending[1].summary).toBe('Change prices by -10% on 2 products: "Delta A", "Delta B"');
    expect(await db.product.count()).toBe(2);
    expect((await db.product.findUniqueOrThrow({ where: { id: b.id } })).priceExPence).toBe(2000);
    expect(await db.auditLog.count({ where: { source: "AI" } })).toBe(0);
  });

  it("falls back to the second model, and gives up politely", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = scripted([new Error("overloaded"), say("from fallback")]);
    expect((await runAssistant(a.client, [{ role: "user", content: "hi" }], ctx(), MODELS)).reply).toBe("from fallback");
    expect(a.sent.map((s) => s.model)).toEqual(["primary", "fallback"]);

    const b = scripted([new Error("down"), new Error("down")]);
    expect((await runAssistant(b.client, [{ role: "user", content: "hi" }], ctx(), MODELS)).reply).toMatch(/unavailable/);
    spy.mockRestore();
  });

  it("handles refusals, truncation and runaway loops", async () => {
    const r = scripted([{ content: [], stop_reason: "refusal" }]);
    expect((await runAssistant(r.client, [{ role: "user", content: "x" }], ctx(), MODELS)).reply).toMatch(/cannot help/);

    const t = scripted([{ content: [{ type: "text", text: "partial" }], stop_reason: "max_tokens" }]);
    expect((await runAssistant(t.client, [{ role: "user", content: "x" }], ctx(), MODELS)).reply).toContain("cut short");

    const loop = scripted(Array.from({ length: 10 }, () => call("list_categories", {})));
    const out = await runAssistant(loop.client, [{ role: "user", content: "x" }], ctx(), MODELS);
    expect(out.reply).toMatch(/too many steps/);
  });

  it("cleans the history it is sent", () => {
    expect(cleanMessages("nope")).toEqual([]);
    const long = "x".repeat(5000);
    const cleaned = cleanMessages([{ role: "user", content: long }, { role: "system", content: "x" }, { role: "assistant", content: " " }, null]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].content).toHaveLength(4000);
  });
});

describe("tools", () => {
  it("search filters by what is missing, and reports orders and sales", async () => {
    await createProduct(staff, { name: "Echo One", categorySlug: "fryers", priceEx: 10, brand: "Acme", description: "d" });
    await createProduct(staff, { name: "Echo Two", categorySlug: "fryers" });
    const run = async (name: string, input: object) => (await execute(name, input, ctx())) as { kind: "result"; data: any };

    expect((await run("search_products", { missing: "price" })).data.products.map((p: any) => p.name)).toEqual(["Echo Two"]);
    expect((await run("search_products", { missing: "description" })).data.matching).toBe(1);
    expect((await run("search_products", { missing: "spec" })).data.matching).toBe(2);
    expect((await run("search_products", { missing: "seo", brand: "acme", query: "echo one" })).data.matching).toBe(1);
    expect((await run("get_product", { id: "echo-one" })).data.description).toBe("d");
    await expect(run("get_product", { id: "nope" })).rejects.toThrow(/no product/);
    expect((await run("list_categories", {})).data[0]).toMatchObject({ slug: "fryers", products: 2 });

    await db.order.create({
      data: {
        status: "PAID", email: "c@example.com", name: "Cam", phone: "1", addressLine1: "x", city: "c", postcode: "p", subtotalExPence: 1000, totalIncPence: 1200,
        lines: { create: [{ productId: "echo-one", name: "Echo One", unitExPence: 1000, unitIncPence: 1200, qty: 2 }] },
      },
    });
    expect((await run("list_orders", {})).data[0]).toMatchObject({ customer: "Cam", totalIncVat: 12 });
    expect((await run("list_orders", { status: "SHIPPED" })).data).toEqual([]);
    const sales = (await run("sales_summary", { days: 7 })).data;
    expect(sales).toMatchObject({ orders: 1, revenueIncVat: 12, bestSellers: [{ id: "echo-one", units: 2 }] });
    expect((await run("recent_changes", {})).data.length).toBeGreaterThan(0);
  });

  it("creates products and categories, and edits categories", async () => {
    const run = async (name: string, input: object) => (await execute(name, input, ctx())) as { kind: "result"; data: any };
    expect((await run("create_product", { name: "Foxtrot Grill", categorySlug: "fryers" })).data.created.status).toBe("DRAFT");
    await run("create_category", { slug: "grills", label: "Grills" });
    await run("update_category", { slug: "grills", changes: { label: "Chargrills" } });
    expect((await db.category.findUniqueOrThrow({ where: { slug: "grills" } })).label).toBe("Chargrills");
  });

  it("every tool has a description and a schema", () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.input_schema.type).toBe("object");
    }
    expect(TOOLS.filter((t) => t.confirm).map((t) => t.name).sort()).toEqual(["adjust_prices", "bulk_update_products", "delete_category", "delete_product"]);
  });
});

const propose = async (id: string) => {
  const out = await execute("delete_product", { id }, ctx());
  if (out.kind !== "pending") throw new Error("expected pending");
  return out.pendingId;
};

describe("confirming a proposal", () => {
  it("applies once, for the proposer only, and logs it as the assistant", async () => {
    const p = await createProduct(staff, { name: "Golf Fryer", categorySlug: "fryers" });
    const id = await propose(p.id);

    await expect(resolvePending(id, true, { ...ctx(), userId: "someone-else" })).rejects.toThrow(/expired or was already/);
    expect(await db.product.count()).toBe(1);

    expect((await resolvePending(id, true, ctx())).message).toBe("Done.");
    expect(await db.product.count()).toBe(0);
    expect(await db.auditLog.findFirstOrThrow({ where: { action: "delete" } })).toMatchObject({ source: "AI" });
    await expect(resolvePending(id, true, ctx())).rejects.toThrow(/already/);
  });

  it("can be discarded, and expires", async () => {
    const p = await createProduct(staff, { name: "Hotel Fryer", categorySlug: "fryers" });
    const id = await propose(p.id);
    expect((await resolvePending(id, false, ctx())).message).toMatch(/Nothing was changed/);
    expect(await db.product.count()).toBe(1);

    const old = await propose(p.id);
    await db.pendingAction.update({ where: { id: old }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(resolvePending(old, true, ctx())).rejects.toThrow(/expired/);
  });

  it("reports a change that can no longer be made, and does not leave it pending", async () => {
    const p = await createProduct(staff, { name: "India Fryer", categorySlug: "fryers" });
    const id = await propose(p.id);
    await db.product.delete({ where: { id: p.id } });
    await expect(resolvePending(id, true, ctx())).rejects.toThrow(/no product/);
    expect((await db.pendingAction.findUniqueOrThrow({ where: { id } })).status).toBe("REJECTED");
  });
});

describe("the routes", () => {
  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", host: "localhost", ...headers }, body: JSON.stringify(body) });

  it("refuse anyone who is not signed-in staff", async () => {
    expect((await assistantRoute(post("/api/admin/assistant", { messages: [] }))).status).toBe(401);
    expect((await confirmRoute(post("/api/admin/assistant/confirm", { id: "x", approve: true }))).status).toBe(401);

    const customer = await db.user.create({ data: { email: "c@example.com", name: "C", passwordHash: "x" } });
    await startSession(customer.id);
    expect((await assistantRoute(post("/api/admin/assistant", { messages: [] }))).status).toBe(401);
  });

  describe("for staff", () => {
    beforeEach(async () => {
      await startSession(userId);
    });
    afterAll(() => {
      dependencies.client = () => null;
    });

    it("refuses cross-site and non-JSON requests", async () => {
      expect((await assistantRoute(post("/api/admin/assistant", {}, { origin: "http://evil.example" }))).status).toBe(403);
      const plain = new Request("http://localhost/api/admin/assistant", { method: "POST", headers: { host: "localhost" }, body: "x" });
      expect((await assistantRoute(plain)).status).toBe(415);
    });

    it("answers 503 without a key, 400 for bad bodies, and runs the assistant otherwise", async () => {
      dependencies.client = () => null;
      expect((await assistantRoute(post("/api/admin/assistant", { messages: [{ role: "user", content: "hi" }] }))).status).toBe(503);

      dependencies.client = () => scripted([say("Hello Alex")]).client;
      expect((await assistantRoute(post("/api/admin/assistant", { messages: [] }))).status).toBe(400);
      const bad = new Request("http://localhost/api/admin/assistant", { method: "POST", headers: { "content-type": "application/json", host: "localhost" }, body: "{" });
      expect((await assistantRoute(bad)).status).toBe(400);

      const ok = await assistantRoute(post("/api/admin/assistant", { messages: [{ role: "user", content: "hi" }] }));
      expect(await ok.json()).toMatchObject({ reply: "Hello Alex", pending: [] });
    });

    it("confirm applies a proposal and reports a stale one", async () => {
      const p = await createProduct(staff, { name: "Juliet Fryer", categorySlug: "fryers" });
      const id = await propose(p.id);
      expect((await confirmRoute(post("/api/admin/assistant/confirm", { id }))).status).toBe(400);

      const done = await confirmRoute(post("/api/admin/assistant/confirm", { id, approve: true }));
      expect(await done.json()).toMatchObject({ message: "Done." });
      expect(await db.product.count()).toBe(0);
      expect((await confirmRoute(post("/api/admin/assistant/confirm", { id, approve: true }))).status).toBe(409);
      const bad = new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", host: "localhost" }, body: "{" });
      expect((await confirmRoute(bad)).status).toBe(400);
    });
  });
});
