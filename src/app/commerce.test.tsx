import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jar, redirectedTo, resetTestState } from "@/test/next-mocks";

vi.mock("next/headers", async () => (await import("@/test/next-mocks")).headersMock);
vi.mock("next/cache", async () => (await import("@/test/next-mocks")).cacheMock);

import AccountPage from "@/app/(shop)/account/page";
import ForgotPage from "@/app/(shop)/account/forgot/page";
import LoginPage from "@/app/(shop)/account/login/page";
import RegisterPage from "@/app/(shop)/account/register/page";
import ResetPage from "@/app/(shop)/account/reset/[token]/page";
import AdminLayout from "@/app/(admin)/admin/layout";
import AdminHome from "@/app/(admin)/admin/page";
import EnquiriesPage from "@/app/(admin)/admin/enquiries/page";
import OrderPage from "@/app/(admin)/admin/orders/[id]/page";
import OrdersPage from "@/app/(admin)/admin/orders/page";
import RedirectsPage from "@/app/(admin)/admin/redirects/page";
import UsersPage from "@/app/(admin)/admin/users/page";
import BasketPage from "@/app/(shop)/basket/page";
import CheckoutPage from "@/app/(shop)/checkout/page";
import SuccessPage from "@/app/(shop)/checkout/success/page";
import ContactPage from "@/app/(shop)/contact/page";
import ProductPage from "@/app/(shop)/ovens/[type]/[id]/page";
import { serializeCart } from "@/lib/cart";
import { db } from "@/server/db";
import { startSession } from "@/server/session";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const params = <T,>(v: T) => Promise.resolve(v);
const fillBasket = (items: [string, number][]) => jar.set("ck_cart", serializeCart(items.map(([id, qty]) => ({ id, qty }))));

beforeEach(resetTestState);
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());

const signIn = async (role: "ADMIN" | "CUSTOMER" = "CUSTOMER", email = `${role.toLowerCase()}@example.com`) => {
  const user = await db.user.create({ data: { email, name: `${role} Person`, passwordHash: "x", role } });
  await startSession(user.id);
  return user;
};
const order = (over: Record<string, unknown> = {}) =>
  db.order.create({
    data: {
      email: "sam@example.com", name: "Sam", phone: "01", addressLine1: "1 High St", city: "Ulverston", postcode: "LA12 7QQ", subtotalExPence: 100000, totalIncPence: 120000,
      lines: { create: [{ productId: "cr6d", name: "Blue Seal CR6D", unitExPence: 100000, unitIncPence: 120000, qty: 1 }] }, ...over,
    },
  });

describe("account pages", () => {
  it("render the sign-in, sign-up, forgot and reset forms, with a safe return path", async () => {
    const login = html(await LoginPage({ searchParams: params({ next: "/basket" }) }));
    expect(login).toContain('name="email"');
    expect(login).toContain('name="next" value="/basket"');
    expect(login).toContain("/account/register?next=%2Fbasket");
    expect(html(await LoginPage({ searchParams: params({ next: "//evil.example", reset: "1" }) }))).toContain("Your password has been changed");
    expect(html(await LoginPage({ searchParams: params({ next: "//evil.example" }) }))).toContain('name="next" value=""');
    expect(html(await RegisterPage({ searchParams: params({}) }))).toContain("Create account");
    expect(html(await RegisterPage({ searchParams: params({ next: "/checkout" }) }))).toContain('value="/checkout"');
    expect(html(<ForgotPage />)).toContain("Send the link");
    expect(html(await ResetPage({ params: params({ token: "abc" }) }))).toContain('name="token" value="abc"');
  });

  it("send a visitor who is not signed in to sign in, and show a customer their orders and enquiries", async () => {
    expect(await redirectedTo(() => AccountPage())).toBe("/account/login?next=/account");
    const user = await signIn();
    await order({ userId: user.id, status: "PAID" });
    await db.enquiry.createMany({ data: [
      { kind: "QUOTE", name: "A", email: "a@b.co", message: "x", userId: user.id, productName: "Blue Seal CR6D" },
      { kind: "GENERAL", name: "A", email: "a@b.co", message: "A long question about delivery", userId: user.id, status: "DONE" },
      { kind: "GENERAL", name: "A", email: "a@b.co", message: "Another", userId: user.id, status: "IN_PROGRESS" },
    ] });
    const out = html(await AccountPage());
    expect(out).toContain("Hello, CUSTOMER Person");
    expect(out).toContain("£1,200.00");
    expect(out).toContain("Paid");
    expect(out).toContain("Blue Seal CR6D");
    expect(out).toContain("A long question about delivery");
    expect(out).toContain("Received");
    expect(out).toContain("Answered");
    expect(out).toContain("In progress");
  });

  it("says so when there is nothing yet", async () => {
    await signIn();
    const out = html(await AccountPage());
    expect(out).toContain("No orders yet.");
    expect(out).toContain("Nothing yet.");
  });
});

describe("basket and checkout pages", () => {
  it("show an empty basket with a way back to the ovens", async () => {
    const out = html(await BasketPage());
    expect(out).toContain("Your basket is empty");
    expect(out).toContain('href="/ovens"');
  });

  it("list lines with VAT and totals priced from the catalogue", async () => {
    fillBasket([["cr6d", 2]]);
    const out = html(await BasketPage());
    expect(out).toContain("Blue Seal Cobra Series CR6D");
    expect(out).toContain('name="qty:cr6d"');
    expect(out).toContain("£3,211.18");
    expect(out).toContain("Subtotal ex VAT");
    expect(out).toContain("£2,675.98");
    expect(out).toContain('href="/checkout"');
  });

  it("sends an empty checkout back to the basket, and otherwise asks how payment will work", async () => {
    expect(await redirectedTo(() => CheckoutPage())).toBe("/basket");
    fillBasket([["cr6d", 1]]);
    const offline = html(await CheckoutPage());
    expect(offline).toContain("Place order");
    expect(offline).toContain("arrange payment");

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const card = html(await CheckoutPage());
    expect(card).toContain("Continue to payment");
    expect(card).toContain("Stripe");
  });

  it("prefills a signed-in customer's details", async () => {
    await signIn("CUSTOMER", "pre@example.com");
    fillBasket([["cr6d", 1]]);
    expect(html(await CheckoutPage())).toContain('value="pre@example.com"');
  });

  it("confirm an order with its number and total only", async () => {
    const o = await order({ status: "AWAITING_PAYMENT" });
    const waiting = html(await SuccessPage({ searchParams: params({ order: o.id }) }));
    expect(waiting).toContain(`Order #${o.number}`);
    expect(waiting).toContain("arrange payment");
    expect(waiting).not.toContain("Sam");
    const paid = await order({ status: "PAID" });
    expect(html(await SuccessPage({ searchParams: params({ order: paid.id }) }))).toContain("your payment is received");
    expect(html(await SuccessPage({ searchParams: params({ order: "nope" }) }))).toContain("We could not find that order");
    expect(html(await SuccessPage({ searchParams: params({}) }))).toContain("We could not find that order");
  });

  it("offer a contact form beside the company's details", () => {
    const out = html(<ContactPage />);
    expect(out).toContain("What do you need?");
    expect(out).toContain("Cater-Kwik Ltd");
    expect(out).toContain("04432906");
  });
});

describe("product page forms", () => {
  const render = async (type: string, id: string) => html(await ProductPage({ params: params({ type, id }) }));

  it("offers to add an available product to the basket, and to request a quote", async () => {
    const out = await render("4-burner", "cr6d");
    expect(out).toContain("Add to basket");
    expect(out).toContain('name="id" value="cr6d"');
    expect(out).toContain("Request a quote");
    expect(out).toContain('name="productId" value="cr6d"');
    expect(out).toContain('name="website"');
  });

  it("offers only a quote for a discontinued product", async () => {
    const out = await render("4-burner", "gl174");
    expect(out).not.toContain("Add to basket");
    expect(out).toContain("Ask about a replacement");
  });
});

describe("admin", () => {
  it("keeps everyone but staff out", async () => {
    expect(await redirectedTo(async () => AdminLayout({ children: null }))).toBe("/account/login?next=/admin");
    await signIn("CUSTOMER");
    expect(await redirectedTo(async () => AdminLayout({ children: null }))).toBe("/account/login?next=/admin");
  });

  it("shows staff the layout and the headline numbers", async () => {
    await signIn("ADMIN");
    expect(html(await AdminLayout({ children: <p>inside</p> }))).toContain("<p>inside</p>");
    await order({ status: "AWAITING_PAYMENT" });
    await order({ status: "PAID" });
    await db.enquiry.create({ data: { kind: "QUOTE", name: "A", email: "a@b.co", message: "x" } });
    const out = html(await AdminHome({ searchParams: params({}) }));
    expect(out).toContain("<b>1</b>");
    expect(out).toContain("Quotes and enquiries");
    expect(out).toContain("Orders awaiting payment");
    expect(out).toContain("£1,200.00");
  });

  it("shows no takings at all before any order is paid", async () => {
    expect(html(await AdminHome({ searchParams: params({}) }))).toContain("£0.00");
  });

  it("lists orders, filters them by status, and shows one with its next steps", async () => {
    await signIn("ADMIN");
    const awaiting = await order({ status: "AWAITING_PAYMENT" });
    await order({ status: "PAID" });
    expect(html(await OrdersPage({ searchParams: params({}) }))).toContain("Awaiting payment");
    const filtered = html(await OrdersPage({ searchParams: params({ status: "PAID" }) }));
    expect(filtered).toContain("£1,200.00");
    expect(filtered).not.toContain(`/admin/orders/${awaiting.id}`);
    expect(html(await OrdersPage({ searchParams: params({ status: "NOPE" }) }))).toContain(`/admin/orders/${awaiting.id}`);
    await db.order.deleteMany();
    expect(html(await OrdersPage({ searchParams: params({}) }))).toContain("No orders.");
  });

  it("shows an order with its customer and the moves available from its state", async () => {
    const o = await order({ status: "PROCESSING", notes: "Back door", trackingNote: "Booked", company: "The Cafe", addressLine2: "Unit 2", paidAt: new Date(), stripeSessionId: "cs_1" });
    const out = html(await OrderPage({ params: params({ id: o.id }) }));
    expect(out).toContain(`Order #${o.number}`);
    expect(out).toContain("Sam, The Cafe");
    expect(out).toContain("1 High St, Unit 2, Ulverston, LA12 7QQ");
    expect(out).toContain("Back door");
    expect(out).toContain("Booked");
    expect(out).toContain("by card");
    expect(out).toContain('name="trackingNote"');
    expect(out).toContain("Cancelled");
    const done = await order({ status: "COMPLETED" });
    expect(html(await OrderPage({ params: params({ id: done.id }) }))).not.toContain("Move this order");
    await expect(OrderPage({ params: params({ id: "nope" }) })).rejects.toThrow();
  });

  it("lists enquiries with the right buttons for each state", async () => {
    await db.enquiry.createMany({ data: [
      { kind: "QUOTE", name: "A", email: "a@b.co", message: "one", productName: "Oven", company: "Co", phone: "01", notes: "rang" },
      { kind: "CALLBACK", name: "B", email: "b@b.co", message: "two", status: "IN_PROGRESS" },
      { kind: "GENERAL", name: "C", email: "c@b.co", message: "three", status: "DONE" },
    ] });
    const out = html(await EnquiriesPage());
    expect(out).toContain("Quote: Oven");
    expect(out).toContain("Call back");
    expect(out).toContain("Mark done");
    expect(out).toContain("Reopen");
    expect(out).toContain("Done");
    await db.enquiry.deleteMany();
    expect(html(await EnquiriesPage())).toContain("Nothing yet.");
  });

  it("lists the redirects staff added, and users with a role switch for everyone but themselves", async () => {
    expect(html(await RedirectsPage())).toContain("None added.");
    await db.customRedirect.create({ data: { fromPath: "/old", toPath: "/ovens" } });
    expect(html(await RedirectsPage())).toContain("/old");

    const me = await signIn("ADMIN");
    await db.user.create({ data: { email: "c@example.com", name: "C", passwordHash: "x" } });
    await db.user.create({ data: { email: "d@example.com", name: "D", passwordHash: "x", role: "ADMIN" } });
    const out = html(await UsersPage());
    expect(out).toContain("Make admin");
    expect(out).toContain("Make customer");
    expect(out.split("Make ").length - 1).toBe(2);
    expect(out).not.toContain(`value="${me.id}"`);
  });
});
