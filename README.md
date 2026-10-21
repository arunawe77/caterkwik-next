# Caterkwik

The Caterkwik commercial ovens site: Next.js (App Router), TypeScript, Postgres. 23 oven types and 413 products are
read from `src/data/scrape.json` (scraped 23 September 2026) and pre-rendered at build time. Orders, quotes and
accounts live in Postgres.

Three pages are exactly as signed off with the client and are embedded unchanged: the **Falcon G3101 OTC/P** product
page, the **6 Burner Ovens** filter page and the **Commercial Ovens hub**. Every other page is generated from the
data in the same design.

```bash
npm install
npm run db:dev                  # a local Postgres, no install needed (leave it running)
cp .env.example .env            # then: DATABASE_URL=postgresql://postgres:postgres@localhost:54320/caterkwik
npx prisma migrate deploy
npm run dev                     # http://localhost:3000

npm test                        # the test suite, each beside the code it tests, against a real Postgres
npm run test:coverage           # fails under 90%
npm run e2e                     # a real browser: buy, register, quote, then work the order as staff
```

## What it does

| Area | Pages |
|---|---|
| Catalogue | `/`, `/ovens`, `/ovens/6-burner-range`, `/ovens/[type]` (filters in the URL), `/ovens/[type]/[product]` (all 413), `/falcon/g3101-otc-p`, `/search?q=` |
| Quotes and enquiries | A quote form on every product page, `/contact` (quote, call back, message). Saved, emailed to the sales team, acknowledged to the customer. |
| Basket and checkout | `/basket`, `/checkout`, `/checkout/success`. Priced by the server from the catalogue. Card payment by Stripe's hosted page; without Stripe keys the team takes payment. |
| Accounts | Register, sign in, password reset by email, order and quote history. A guest's earlier orders join their account when they register. |
| Admin (`/admin`, staff only) | Dashboard, **products** (search, filter, bulk actions, create, edit, archive, delete), **categories**, orders (status flow, tracking note, shipped email), quotes and enquiries, customers, redirects, staff and roles, and an **activity log with undo**. An **AI assistant** (the button bottom right) does the same catalogue work from plain English. |
| SEO | Canonical, Open Graph and Twitter tags on every indexable page; Product, FAQ, Breadcrumb, Collection, Organization and WebSite data; sitemap; `robots.txt`. |
| Old addresses | `/cgi-bin/trolleyed_public.cgi?action=showprod_<TOKEN>` and the old category paths 301 to the new pages before the staging password gate; staff can add more. `node scripts/redirect-report.mjs <url>` checks all 442: 100%. |

## Rules the code keeps

- **Null, never a guess.** A figure that is not published stays null and the page says "Not published".
- **The server prices everything.** The basket cookie holds ids and quantities only. Prices come from the catalogue
  on every read, so nothing a visitor can edit reaches an order.
- **Money is whole pence**, and an order keeps a snapshot of what it was sold for.
- **Stripe events act once.** Each event id is recorded in the same transaction as the change it causes.
- **Mail never loses an order.** An order or enquiry is saved before any email is sent.
- **Products live in Postgres.** The scrape seeds an empty database once; after that the admin is the source of truth.
  The catalogue is held in memory and reloaded after every admin change, so the shop shows an edit at once.
  **Known gap:** the three approved pages (Falcon G3101, 6 Burner Ovens, Commercial Ovens hub) are embedded static
  HTML, so a price edited in the admin changes everywhere except those three. See "Admin and the assistant" below.

## Admin and the assistant

- Every change, from a form or from the assistant, goes through `src/server/catalogue-admin.ts`: validated, written,
  logged in `AuditLog` with before and after, then pushed to the shop. A single product change can be undone from
  `/admin/activity`.
- A new product is a **draft** until put on sale. An in-stock product cannot go on sale without a price.
  A specification must name its source. The inc VAT price is worked out at 20% unless typed.
- The assistant (`src/admin-ai/`) calls Claude with tools. Reading and single-record changes run at once and are
  logged as the assistant; **deletes and anything touching several products only create a pending card** that a staff
  member must Apply. The model has no tool to confirm its own request: that is a separate endpoint (`/api/admin/assistant/confirm`).
  Orders are read only for it.
- Set `ANTHROPIC_API_KEY`. `ADMIN_AI_MODEL` and `ADMIN_AI_FALLBACK_MODEL` override the models.
- The catalogue is loaded at server start by `src/instrumentation.ts`. Storefront pages are rendered per request.

## How it is put together

- `src/lib/catalogue.ts`: 442 listings become 413 products (29 sit in two categories; each is filed under the first).
- `src/lib/copy.ts`: every sentence on the generated pages is built from the catalogue.
- `src/legacy/*.json`: the three approved pages, extracted from the original plain-Node site by `npm run build:legacy`
  (it reads that site at the repo root, one level up). `src/lib/legacy-html.ts` points their addresses at the new pages.
- Two route groups, `(shop)` and `(product)`, load different stylesheets because the approved product page and the
  ovens pages define `.hero` differently. Moving between them is a full page load.
- `src/proxy.ts`: old-address redirects, trailing slashes, the staging gate, `X-Robots-Tag`. `src/server/`: database,
  sessions, actions, orders, Stripe, mail. `src/kit/`: Kit, the product expert, grounded in the catalogue.
- Prisma schema in `prisma/`. Tests start a throwaway Postgres on port 54329 (or use `TEST_DATABASE_URL` in CI).

## Deploying

`deploy/README.md`: Docker Compose on a droplet, nginx and TLS, backups, Stripe, going to production. Pushes to
`develop` are checked and deployed by `.github/workflows/ci-cd.yml`.
