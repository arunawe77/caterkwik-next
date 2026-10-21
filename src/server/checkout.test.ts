import Stripe from "stripe";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { form, jar, redirectedTo, requestHeaders, resetTestState } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);

import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { serializeCart } from "@/lib/cart";
import { addToCart, updateCart } from "@/server/cart-actions";
import { placeOrder } from "@/server/checkout-actions";
import { db } from "@/server/db";
import { outbox } from "@/server/mail";
import { handleStripeEvent } from "@/server/orders";
import { startSession } from "@/server/session";
import { createCheckoutSession, stripeConfigured, stripeDeps } from "@/server/stripe";

const realClient = stripeDeps.client;
let n = 0;
beforeEach(async () => {
  await resetTestState();
  outbox.length = 0;
  requestHeaders.set("x-forwarded-for", `192.168.${Math.floor(++n / 250)}.${n % 250}`);
});
afterEach(() => {
  vi.unstubAllEnvs();
  stripeDeps.client = realClient;
});
afterAll(() => db.$disconnect());

const details = { name: "Sam Chef", email: "Sam@Example.com", phone: "01229 111111", addressLine1: "1 High St", city: "Ulverston", postcode: "LA12 7QQ" };
const fillBasket = (items: [string, number][]) => jar.set("ck_cart", serializeCart(items.map(([id, qty]) => ({ id, qty }))));
const cartItems = () => JSON.parse(decodeURIComponent(jar.get("ck_cart") ?? "%5B%5D"));

describe("basket actions", () => {
  it("adds a product and sends the visitor to the basket", async () => {
    expect(await redirectedTo(() => addToCart(form({ id: "cr6d", qty: "2" })))).toBe("/basket");
    expect(cartItems()).toEqual([["cr6d", 2]]);
    await addToCart(form({ id: "cr6d" })).catch(() => {});
    expect(cartItems()).toEqual([["cr6d", 3]]);
  });

  it("does not add what cannot be bought, and clamps a silly quantity", async () => {
    await redirectedTo(() => addToCart(form({ id: "nope", qty: "1" })));
    expect(jar.has("ck_cart")).toBe(false);
    await redirectedTo(() => addToCart(form({ id: "cr6d", qty: "5000" })));
    expect(cartItems()).toEqual([["cr6d", 99]]);
    await redirectedTo(() => addToCart(form({ id: "slr6c", qty: "abc" })));
    expect(cartItems()).toContainEqual(["slr6c", 1]);
  });

  it("updates quantities and removes a line, and an emptied basket clears the cookie", async () => {
    fillBasket([["cr6d", 1], ["slr6c", 1]]);
    await redirectedTo(() => updateCart(form({ "qty:cr6d": "4", "qty:slr6c": "2" })));
    expect(cartItems()).toEqual([["cr6d", 4], ["slr6c", 2]]);
    await redirectedTo(() => updateCart(form({ "qty:cr6d": "4", "qty:slr6c": "2", remove: "cr6d" })));
    expect(cartItems()).toEqual([["slr6c", 2]]);
    await redirectedTo(() => updateCart(form({ "qty:slr6c": "2", remove: "slr6c" })));
    expect(jar.has("ck_cart")).toBe(false);
  });
});

describe("checkout without Stripe (the team takes payment)", () => {
  it("saves a priced order, empties the basket, emails both sides and shows the confirmation", async () => {
    fillBasket([["cr6d", 2], ["slr6c", 1]]);
    expect(stripeConfigured()).toBe(false);
    const to = await redirectedTo(() => placeOrder({}, form(details)));

    const order = await db.order.findFirstOrThrow({ include: { lines: true } });
    expect(to).toBe(`/checkout/success?order=${order.id}`);
    expect(order).toMatchObject({ status: "AWAITING_PAYMENT", email: "sam@example.com", subtotalExPence: 133799 * 2 + 150799, totalIncPence: 160559 * 2 + 180959 });
    expect(order.lines.map((l) => [l.productId, l.qty, l.unitIncPence])).toEqual(expect.arrayContaining([["cr6d", 2, 160559], ["slr6c", 1, 180959]]));
    expect(jar.has("ck_cart")).toBe(false);
    expect(outbox.map((m) => m.subject)).toEqual([`Caterkwik order #${order.number}`, expect.stringContaining("awaiting payment")]);
  });

  it("links the order to a signed-in customer", async () => {
    const user = await db.user.create({ data: { email: "sam@example.com", name: "Sam", passwordHash: "x" } });
    await startSession(user.id);
    fillBasket([["cr6d", 1]]);
    await redirectedTo(() => placeOrder({}, form(details)));
    expect((await db.order.findFirstOrThrow()).userId).toBe(user.id);
  });

  it("prices from the catalogue even if the basket cookie is tampered with", async () => {
    jar.set("ck_cart", encodeURIComponent(JSON.stringify([["cr6d", 1, 1], ["nope", 5]])));
    await redirectedTo(() => placeOrder({}, form({ ...details, price: "1" })));
    expect((await db.order.findFirstOrThrow()).totalIncPence).toBe(160559);
  });

  it("refuses an empty basket and a bad form, and saves nothing", async () => {
    expect((await placeOrder({}, form(details))).error).toBe("Your basket is empty.");
    fillBasket([["cr6d", 1]]);
    expect((await placeOrder({}, form({ ...details, phone: "" }))).error).toBe("Phone number is required");
    expect((await placeOrder({}, form({ ...details, email: "x" }))).error).toBe("Enter a valid email address");
    expect(await db.order.count()).toBe(0);
  });

  it("limits attempts", async () => {
    for (let i = 0; i < 20; i++) await placeOrder({}, form({}));
    expect((await placeOrder({}, form(details))).error).toContain("Too many attempts");
  });
});

describe("checkout with Stripe", () => {
  const fakeStripe = (create: (p: Stripe.Checkout.SessionCreateParams) => Promise<unknown>) =>
    (stripeDeps.client = () => ({ checkout: { sessions: { create } } }) as unknown as Stripe);

  it("sends the customer to the hosted payment page, charging the VAT-inclusive price", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    let sent!: Stripe.Checkout.SessionCreateParams;
    fakeStripe(async (p) => ((sent = p), { id: "cs_1", url: "https://checkout.stripe.com/pay/cs_1" }));
    fillBasket([["cr6d", 2]]);

    expect(await redirectedTo(() => placeOrder({}, form(details)))).toBe("https://checkout.stripe.com/pay/cs_1");
    const order = await db.order.findFirstOrThrow();
    expect(order.stripeSessionId).toBe("cs_1");
    expect(order.status).toBe("AWAITING_PAYMENT");
    expect(sent).toMatchObject({ mode: "payment", customer_email: "sam@example.com", client_reference_id: order.id, metadata: { orderId: order.id } });
    expect(sent.line_items).toEqual([{ quantity: 2, price_data: { currency: "gbp", unit_amount: 160559, product_data: { name: expect.stringContaining("CR6D") } } }]);
    expect(sent.success_url).toContain(`/checkout/success?order=${order.id}`);
    expect(outbox).toHaveLength(0); // confirmation waits for payment
    expect(jar.has("ck_cart")).toBe(true);
  });

  it("cancels the order and says nothing was charged when Stripe fails", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeStripe(async () => { throw new Error("down"); });
    fillBasket([["cr6d", 1]]);
    expect((await placeOrder({}, form(details))).error).toContain("Nothing has been charged");
    expect((await db.order.findFirstOrThrow()).status).toBe("CANCELLED");
    fakeStripe(async () => { throw "odd"; });
    await placeOrder({}, form(details));
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("fails if Stripe returns no URL", async () => {
    fakeStripe(async () => ({ id: "cs_x", url: null }));
    const order = await db.order.create({ data: { email: "a@b.co", name: "A", phone: "1", addressLine1: "x", city: "c", postcode: "p", subtotalExPence: 1, totalIncPence: 1 }, include: { lines: true } });
    await expect(createCheckoutSession(order)).rejects.toThrow("no checkout URL");
  });
});

describe("the real Stripe client", () => {
  it("is built from the configured secret key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_real");
    expect(realClient()).toBeInstanceOf(Stripe);
  });
});

describe("Stripe webhook", () => {
  const SECRET = "whsec_test";
  const event = (type: string, orderId: string | undefined, over: Record<string, unknown> = {}, id = `evt_${Math.random()}`) =>
    JSON.stringify({ id, object: "event", type, data: { object: { id: "cs_1", object: "checkout.session", payment_status: "paid", metadata: orderId ? { orderId } : {}, ...over } } });
  const send = (payload: string, signature?: string) =>
    webhook(new Request("http://x.test/api/stripe/webhook", {
      method: "POST", body: payload,
      headers: signature === undefined ? { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) } : { "stripe-signature": signature },
    }));
  const awaiting = () => db.order.create({ data: { email: "sam@example.com", name: "Sam", phone: "1", addressLine1: "x", city: "c", postcode: "p", subtotalExPence: 100, totalIncPence: 120, lines: { create: [{ productId: "cr6d", name: "Oven", unitExPence: 100, unitIncPence: 120, qty: 1 }] } } });

  beforeEach(() => vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET));

  it("marks the order paid and sends the confirmations", async () => {
    const order = await awaiting();
    const res = await send(event("checkout.session.completed", order.id));
    expect(await res.json()).toEqual({ result: "handled" });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: "PAID", paidAt: expect.any(Date) });
    expect(outbox.map((m) => m.to)).toEqual(["sam@example.com", "sales@caterkwik.co.uk"]);
    expect(outbox[1].subject).toContain("(paid)");
  });

  it("acts on a repeated event once", async () => {
    const order = await awaiting();
    const payload = event("checkout.session.completed", order.id, {}, "evt_same");
    expect(await (await send(payload)).json()).toEqual({ result: "handled" });
    outbox.length = 0;
    expect(await (await send(payload)).json()).toEqual({ result: "duplicate" });
    expect(outbox).toHaveLength(0);
  });

  it("cancels an abandoned checkout, and never un-pays a paid order", async () => {
    const abandoned = await awaiting();
    await send(event("checkout.session.expired", abandoned.id, { payment_status: "unpaid" }));
    expect((await db.order.findUniqueOrThrow({ where: { id: abandoned.id } })).status).toBe("CANCELLED");

    const paid = await awaiting();
    await send(event("checkout.session.completed", paid.id));
    await send(event("checkout.session.expired", paid.id, { payment_status: "unpaid" }));
    expect((await db.order.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe("PAID");
  });

  it("does not mark an unpaid completed session as paid", async () => {
    const order = await awaiting();
    outbox.length = 0;
    await send(event("checkout.session.completed", order.id, { payment_status: "unpaid" }));
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
    expect(outbox).toHaveLength(0);
  });

  it("ignores other event types and sessions with no order", async () => {
    expect(await (await send(event("customer.created", undefined))).json()).toEqual({ result: "ignored" });
    expect(await (await send(event("checkout.session.completed", undefined))).json()).toEqual({ result: "ignored" });
  });

  it("copes with a payment for an order that has since been deleted", async () => {
    expect(await handleStripeEvent(JSON.parse(event("checkout.session.completed", "gone")))).toBe("handled");
    expect(outbox).toHaveLength(0);
  });

  it("rejects a bad signature, a missing signature, and a missing secret", async () => {
    const order = await awaiting();
    const payload = event("checkout.session.completed", order.id);
    expect((await send(payload, "t=1,v1=forged")).status).toBe(400);
    expect((await webhook(new Request("http://x.test", { method: "POST", body: payload }))).status).toBe(400);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await send(payload)).status).toBe(400);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("AWAITING_PAYMENT");
  });
});
