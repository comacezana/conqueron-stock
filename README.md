# Conqueron Stock Ledger

Inventory and stock-movement app for Conqueron Trading plc. Next.js + TypeScript + PostgreSQL (embedded PGlite, so nothing to install).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
# production: npm run build && npm start
```

First start creates `data/pgdata` and seeds the 56 products from `data/catalog.json` (extracted from "MODJO SHIPPED QUANTITY FOR SAMUEL") as Opening Stock movements.

Default logins (change them under Users, or set `ADMIN_PASSWORD` / `STORE_PASSWORD` before first start):

- `admin` / `admin123`
- `store` / `store123`

Env: `SESSION_SECRET` (else generated in `data/.secret`), `INSECURE_COOKIES=1` if serving production over plain HTTP.

## Tests

```bash
npm test   # 26 checks: sales, no negative stock, partial/over returns, permissions, immutability, concurrency
```

## Rules enforced on the server

- Roles: Admin and Store only. Store can sell, Stock In, record Damage and view history. Return, Opening Stock and product/category/user/settings admin are Admin only.
- A Return is never a generic Stock In. It is created from a sale (Stock History, open the sale, Return items) and stores `source_movement_id`. Partial returns are allowed; total returned can never exceed the sale. The original sale row is never changed. Stock In has no source.
- One code path (`lib/stock.ts`) changes stock: row lock, negative-stock rejection, movement and balance written in one transaction.
- `stock_movements` is append-only (database trigger blocks UPDATE/DELETE) and CHECK constraints enforce `new = previous ± quantity`.
- Timestamps and `created_by` are set by the server.

## Decisions taken (change in code/Settings if wrong)

Damage can be recorded by Store (toggle in Settings); sale amount optional; currency label ETB; whole-number quantities; products with no minimum show MINIMUM NOT SET (zero stock is always OUT OF STOCK); no categories or minimums are invented at import; "Suggest from product names" on Categories is an Admin action that only fills empty categories.

Moving to a hosted PostgreSQL later: replace `lib/db.ts` with a `pg` pool; the SQL is standard Postgres.
