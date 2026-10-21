import type { Enquiry, Order, OrderLine } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { form, requestHeaders, resetTestState } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);

import { db } from "@/server/db";
import { enquiryForCustomer, enquiryForTeam, orderConfirmation, orderForTeam, passwordReset } from "@/server/emails";
import { submitEnquiry } from "@/server/enquiry-actions";
import { outbox, sendMail } from "@/server/mail";
import { startSession } from "@/server/session";

let n = 0;
beforeEach(async () => {
  await resetTestState();
  outbox.length = 0;
  requestHeaders.set("x-forwarded-for", `172.16.${Math.floor(++n / 250)}.${n % 250}`);
});
afterAll(() => db.$disconnect());

const valid = { kind: "QUOTE", name: "Sam Chef", email: "Sam@Example.com", phone: "01229 111111", company: "The Cafe", message: "Price for ten?" };

describe("submitEnquiry", () => {
  it("saves the enquiry, emails the team with a reply-to, and acknowledges the customer", async () => {
    expect(await submitEnquiry({}, form({ ...valid, productId: "CR6D" }))).toEqual({ ok: true });

    const saved = await db.enquiry.findFirstOrThrow();
    expect(saved).toMatchObject({ kind: "QUOTE", status: "NEW", email: "sam@example.com", productId: "cr6d", productName: "Blue Seal Cobra Series CR6D Gas 4 Burner Oven" });

    expect(outbox).toHaveLength(2);
    const [team, customer] = outbox;
    expect(team.to).toBe("sales@caterkwik.co.uk");
    expect(team.replyTo).toBe("sam@example.com");
    expect(team.subject).toContain("Quote request from Sam Chef: Blue Seal Cobra Series CR6D");
    expect(customer.to).toBe("sam@example.com");
    expect(customer.text).toContain("Price for ten?");
  });

  it("takes the product name from the catalogue, not the form, and ignores an unknown product", async () => {
    await submitEnquiry({}, form({ ...valid, productId: "nope", productName: "Fake £1 oven" }));
    expect(await db.enquiry.findFirstOrThrow()).toMatchObject({ productId: null, productName: null });
  });

  it("links the enquiry to the signed-in customer", async () => {
    const user = await db.user.create({ data: { email: "sam@example.com", name: "Sam", passwordHash: "x" } });
    const { jar } = await import("@/test/next-mocks");
    await startSession(user.id);
    expect(jar.has("ck_session")).toBe(true);
    await submitEnquiry({}, form(valid));
    expect((await db.enquiry.findFirstOrThrow()).userId).toBe(user.id);
  });

  it("keeps nothing when the hidden field is filled, but looks successful to the bot", async () => {
    expect(await submitEnquiry({}, form({ ...valid, website: "http://spam.example" }))).toEqual({ ok: true });
    expect(await db.enquiry.count()).toBe(0);
    expect(outbox).toHaveLength(0);
  });

  it("rejects a bad form with the first problem", async () => {
    expect((await submitEnquiry({}, form({ ...valid, name: "" }))).error).toBe("Name is required");
    expect((await submitEnquiry({}, form({ ...valid, email: "nope" }))).error).toBe("Enter a valid email address");
    expect((await submitEnquiry({}, form({ ...valid, message: "  " }))).error).toBe("A message is required");
    expect((await submitEnquiry({}, form({ ...valid, kind: "SPAM" }))).error).toBeTruthy();
    expect(await db.enquiry.count()).toBe(0);
  });

  it("limits one visitor to five a hour", async () => {
    for (let i = 0; i < 5; i++) expect((await submitEnquiry({}, form(valid))).ok).toBe(true);
    expect((await submitEnquiry({}, form(valid))).error).toContain("Too many messages");
    expect(await db.enquiry.count()).toBe(5);
  });

  it("treats a request with no forwarding header as one anonymous visitor", async () => {
    requestHeaders.clear();
    requestHeaders.set("x-forwarded-for", "");
    expect((await submitEnquiry({}, form(valid))).ok).toBe(true);
  });
});

describe("sendMail", () => {
  it("keeps only the last 50 messages in the dev outbox", async () => {
    for (let i = 0; i < 55; i++) await sendMail({ to: "a@b.co", subject: `s${i}`, text: "t" });
    expect(outbox).toHaveLength(50);
    expect(outbox[0].subject).toBe("s5");
  });

  it("sends over SMTP when configured, from the configured address", async () => {
    vi.resetModules();
    vi.stubEnv("SMTP_URL", "smtp://user:pass@mail.example:587");
    vi.stubEnv("MAIL_FROM", "Shop <shop@example.com>");
    const sendMailSpy = vi.fn().mockResolvedValue({});
    vi.doMock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: sendMailSpy }) } }));
    const fresh = await import("@/server/mail");
    expect(await fresh.sendMail({ to: "a@b.co", subject: "s", text: "t" })).toBe(true);
    expect(sendMailSpy).toHaveBeenCalledWith({ from: "Shop <shop@example.com>", to: "a@b.co", subject: "s", text: "t" });
    vi.doUnmock("nodemailer");
    vi.unstubAllEnvs();
  });

  it("reports a failure instead of throwing, so a saved order is never lost to a mail outage", async () => {
    vi.resetModules();
    vi.stubEnv("SMTP_URL", "smtp://broken");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: () => Promise.reject(new Error("refused")) }) } }));
    const fresh = await import("@/server/mail");
    expect(await fresh.sendMail({ to: "a@b.co", subject: "s", text: "t" })).toBe(false);
    expect(log).toHaveBeenCalledWith("[mail] could not send:", "refused");

    vi.doMock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: () => Promise.reject("odd") }) } }));
    vi.resetModules();
    expect(await (await import("@/server/mail")).sendMail({ to: "a@b.co", subject: "s", text: "t" })).toBe(false);
    vi.doUnmock("nodemailer");
    vi.unstubAllEnvs();
  });
});

describe("email templates", () => {
  const enquiry: Enquiry = { id: "e1", kind: "CALLBACK", status: "NEW", name: "Sam", email: "s@x.co", phone: null, company: null, message: "Ring me", productId: null, productName: null, notes: null, userId: null, createdAt: new Date() };
  const order: Order & { lines: OrderLine[] } = {
    id: "o1", number: 1042, status: "PAID", email: "s@x.co", name: "Sam", phone: "1", company: null, addressLine1: "1 High St", addressLine2: null,
    city: "Ulverston", postcode: "LA12 7QQ", notes: null, subtotalExPence: 100000, totalIncPence: 120000, stripeSessionId: null, paidAt: null,
    trackingNote: null, userId: null, createdAt: new Date(), updatedAt: new Date(),
    lines: [{ id: "l", orderId: "o1", productId: "cr6d", name: "Oven", unitExPence: 100000, unitIncPence: 120000, qty: 1 }],
  };

  it("labels each kind of enquiry and only mentions what was given", () => {
    expect(enquiryForTeam(enquiry)).toMatchObject({ subject: "Call-back request from Sam" });
    const text = enquiryForTeam(enquiry).text;
    expect(text).not.toContain("Phone:");
    expect(text).not.toContain("Company:");
    expect(text).toContain("Ring me");
    expect(enquiryForTeam({ ...enquiry, kind: "GENERAL", phone: "01", company: "Co", productName: "Oven", productId: "cr6d" }).text).toContain("Phone: 01");
    expect(enquiryForCustomer({ ...enquiry, kind: "GENERAL" }).subject).toBe("We have your enquiry");
  });

  it("confirms a paid order and one awaiting payment, in pounds with thousands separators", () => {
    const paid = orderConfirmation({ ...order });
    expect(paid.subject).toBe("Caterkwik order #1042");
    expect(paid.text).toContain("received your payment");
    expect(paid.text).toContain("Total including VAT: £1,200.00");
    expect(paid.text).toContain("1 High St, Ulverston, LA12 7QQ");
    expect(orderConfirmation({ ...order, status: "AWAITING_PAYMENT" }).text).toContain("contact you to arrange payment");
    expect(orderForTeam({ ...order }).subject).toBe("New order #1042 (paid): £1,200.00");
    expect(orderForTeam({ ...order, status: "AWAITING_PAYMENT" }).subject).toContain("awaiting payment");
  });

  it("emails a reset link that names the person", () => {
    expect(passwordReset("Sam", "tok").text).toContain("/account/reset/tok");
  });
});
