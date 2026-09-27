# Conqueron Stock Ledger

Inventory and stock-movement app for Conqueron Trading plc. Next.js + TypeScript + PostgreSQL.

The database backend switches automatically:

- **`DATABASE_URL` unset** — an embedded Postgres (PGlite), stored in `data/pgdata`. Nothing to install, but needs a real persistent disk (a self-hosted VM), never a serverless/edge host.
- **`DATABASE_URL` set** — a real Postgres over the network, via `pg`. Use this for any serverless or edge host (Vercel, Cloudflare, etc.), since those have no durable local disk. [Neon](https://neon.tech) has a free tier that works well for this.

Both paths run the exact same schema and queries (`lib/db.ts`), so nothing else in the app changes between them.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

First start creates `data/pgdata` and seeds the 56 products from `data/catalog.json` (extracted from "MODJO SHIPPED QUANTITY FOR SAMUEL") as Opening Stock movements. Same seeding runs automatically against a real Postgres the first time it's queried.

Default logins (change them under Users, or set `ADMIN_PASSWORD` / `STORE_PASSWORD` before first start — they only take effect the very first time the database seeds):

- `admin` / `admin123`
- `store` / `store123`

## Deploy — Neon (database) + any host (app)

### 1. Create the database

1. Sign up at [neon.tech](https://neon.tech) (free tier, no card needed).
2. Create a project. Copy the connection string it gives you (starts `postgresql://...`).

### 2. Set environment variables on your host

```
DATABASE_URL=<the Neon connection string>
SESSION_SECRET=<a long random string — required whenever DATABASE_URL is set>
ADMIN_PASSWORD=<real password, only used the very first time the database seeds>
STORE_PASSWORD=<same>
NODE_ENV=production
```

Generate a `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The app refuses to start without `SESSION_SECRET` once `DATABASE_URL` is set — there's no durable disk to persist a generated one on, and a different secret each cold start would silently log everyone out.

### 3. Deploy the app

Any standard Next.js host works now, since the app itself is stateless — it's just a client of Neon. On **Vercel**: import the GitHub repo, add the environment variables above, deploy. No persistent volume needed, no memory concerns from an embedded database, because there isn't one anymore.

### 4. First request

The first request that touches the database creates the schema and seeds the 56 products automatically. Sign in as `admin`, go to **Users**, and set real passwords.

## Self-hosting instead (embedded database, no Neon)

Leave `DATABASE_URL` unset. Needs a host with a real persistent disk for `data/pgdata` (a VM, or a container platform with a persistent volume) — not Vercel, not Cloudflare Workers, not any platform without durable local storage.

## Tests

```bash
npm test   # 26 checks: sales, no negative stock, partial/over returns, permissions, immutability, concurrency
```

Runs against the embedded database (no `DATABASE_URL` needed). Since both backends run identical SQL, this also validates the Neon path — but after first deploying to Neon, sign in once and check Inventory to confirm the seed ran.

## Rules enforced on the server

- Roles: Admin and Store only. Store can sell, Stock In, record Damage and view history. Return, Opening Stock and product/category/user/settings admin are Admin only.
- A Return is never a generic Stock In. It is created from a sale (Stock History, open the sale, Return items) and stores `source_movement_id`. Partial returns are allowed; total returned can never exceed the sale. The original sale row is never changed. Stock In has no source.
- One code path (`lib/stock.ts`) changes stock: row lock, negative-stock rejection, movement and balance written in one transaction.
- `stock_movements` is append-only (database trigger blocks UPDATE/DELETE) and CHECK constraints enforce `new = previous ± quantity`.
- Timestamps and `created_by` are set by the server.

## Decisions taken (change in code/Settings if wrong)

Damage can be recorded by Store (toggle in Settings); sale amount optional; currency label ETB; whole-number quantities; products with no minimum show MINIMUM NOT SET (zero stock is always OUT OF STOCK); no categories or minimums are invented at import; "Suggest from product names" on Categories is an Admin action that only fills empty categories.
