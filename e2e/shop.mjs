// An end-to-end run in a real browser against a running site and its database.
//
//   npm run build && npm start            (with DATABASE_URL set, SITE_PASSWORD unset)
//   BASE_URL=http://localhost:3000 node e2e/shop.mjs
//
// It wipes the orders, accounts and enquiries in the database it is pointed at, so only ever
// point it at a development database.

import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";

const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const db = new PrismaClient();
let step = 0;
const ok = (msg) => console.log(`  ok ${String(++step).padStart(2)}  ${msg}`);
const fail = (msg) => { throw new Error(msg); };
const expect = (cond, msg) => (cond ? ok(msg) : fail(`FAILED: ${msg}`));

await db.$transaction([
  db.webhookEvent.deleteMany(), db.orderLine.deleteMany(), db.order.deleteMany(), db.enquiry.deleteMany(),
  db.passwordReset.deleteMany(), db.session.deleteMany(), db.customRedirect.deleteMany(), db.user.deleteMany(),
]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ baseURL: base })).newPage();
// A server action answers after the click returns, so database checks wait for the change.
const eventually = async (read, want, tries = 40) => {
  for (let i = 0; i < tries; i++) { if (want(await read())) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
};
const text = (sel) => page.locator(sel).first().innerText();
const onPath = (path) => (url) => url.pathname === path; // a glob like **/admin also matches ?next=/admin

try {
  console.log("Shopping as a guest");
  await page.goto("/ovens/4-burner/cr6d");
  await page.getByRole("button", { name: "Add to basket" }).click();
  await page.waitForURL(onPath("/basket"));
  expect((await text("main")).includes("Blue Seal Cobra Series CR6D"), "the product is in the basket");
  expect((await text(".utility")).includes("Basket (1)"), "the header shows the basket count");

  await page.locator('input[name="qty:cr6d"]').fill("2");
  await page.getByRole("button", { name: "Update quantities" }).click();
  await page.waitForLoadState("networkidle");
  expect((await text("aside")).includes("£3,211.18"), "two ovens total £3,211.18 including VAT");

  await page.getByRole("link", { name: "Go to checkout" }).click();
  await page.waitForURL(onPath("/checkout"));
  await page.fill('input[name="name"]', "Sam Chef");
  await page.fill('input[name="email"]', "sam@example.com");
  await page.fill('input[name="phone"]', "01229 111111");
  await page.fill('input[name="addressLine1"]', "1 High Street");
  await page.fill('input[name="city"]', "Ulverston");
  await page.fill('input[name="postcode"]', "LA12 7QQ");
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL("**/checkout/success**");
  expect((await text("h1")).includes("we have your order"), "the order is confirmed");
  expect(!(await text("main")).includes("Sam"), "the confirmation shows no personal details");
  const order = await db.order.findFirstOrThrow({ include: { lines: true } });
  expect(order.totalIncPence === 321118 && order.lines[0].qty === 2, "the order was priced by the server");

  console.log("Registering, and finding the guest order");
  await page.goto("/account/register");
  await page.fill('input[name="name"]', "Sam Chef");
  await page.fill('input[name="email"]', "sam@example.com");
  await page.fill('input[name="password"]', "correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(onPath("/account"));
  expect((await text("main")).includes(`#${order.number}`), "the earlier guest order is on the new account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(`${base}/`);

  console.log("Asking for a quote");
  await page.goto("/ovens/4-burner/gl174");
  await page.locator("summary", { hasText: "Ask about a replacement" }).click();
  await page.fill('input[name="name"]', "Pat");
  await page.fill('input[name="email"]', "pat@example.com");
  await page.fill('textarea[name="message"]', "What replaces the GL174?");
  await page.getByRole("button", { name: "Request a quote" }).click();
  await page.getByRole("status").waitFor();
  expect((await db.enquiry.count({ where: { productId: "gl174" } })) === 1, "the quote request was saved against the product");

  console.log("Working the order as staff");
  execFileSync("node", ["scripts/make-admin.mjs", "sam@example.com"], { stdio: "pipe" });
  await page.goto("/account/login?next=/admin");
  await page.fill('input[name="email"]', "sam@example.com");
  await page.fill('input[name="password"]', "correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(onPath("/admin"));
  expect((await text("main")).includes("new quotes and enquiries"), "the admin overview opens");

  await page.goto(`/admin/orders/${order.id}`);
  for (const [button, status] of [["Paid", "PAID"], ["Processing", "PROCESSING"]]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    expect(await eventually(() => db.order.findUniqueOrThrow({ where: { id: order.id } }), (o) => o.status === status), `the order moves to ${status}`);
  }
  await page.fill('input[name="trackingNote"]', "Pallet delivery, DPD");
  await page.getByRole("button", { name: "Shipped" }).click();
  expect(await eventually(() => db.order.findUniqueOrThrow({ where: { id: order.id } }), (o) => o.status === "SHIPPED" && o.trackingNote === "Pallet delivery, DPD"), "shipping records the tracking note");

  await page.goto("/admin/redirects");
  await page.fill('input[name="fromPath"]', "/old-cooker");
  await page.fill('input[name="toPath"]', "/ovens/4-burner/cr6d");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("status").waitFor();
  // The proxy refreshes its redirect list every 15 seconds.
  let response;
  expect(await eventually(async () => (response = await page.request.get("/old-cooker", { maxRedirects: 0 })), (r) => r.status() === 301, 200), "an admin-added redirect answers 301 within 20 seconds");
  expect(response.headers().location?.endsWith("/ovens/4-burner/cr6d"), "it points where it was told to");

  console.log("Old addresses and health");
  const legacy = await page.request.get("/cgi-bin/trolleyed_public.cgi?action=showprod_CR6D", { maxRedirects: 0 });
  expect(legacy.status() === 301, "an old product address redirects");
  expect((await page.request.get("/api/health?db=1")).ok(), "the health check reaches the database");

  console.log(`\nAll ${step} checks passed.`);
} catch (err) {
  await page.screenshot({ path: "e2e-failure.png", fullPage: true }).catch(() => {});
  console.error(`\n${err.message}\n(screenshot: e2e-failure.png, page: ${page.url()})`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await db.$disconnect();
}
