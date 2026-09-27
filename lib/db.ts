import { randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
}

/**
 * The app talks to the database only through this shape, whichever engine backs it:
 * - DATABASE_URL set  -> a real Postgres (e.g. Neon), via `pg`. Use this in production/serverless,
 *   where there is no durable local disk to store an embedded database on.
 * - DATABASE_URL unset -> an embedded Postgres (PGlite) stored under data/pgdata. Zero setup for
 *   local development, or for self-hosting on a machine with a real persistent disk.
 * Both speak the same Postgres SQL, so the schema and every query below run unchanged either way.
 */
export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Tx {
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

type G = typeof globalThis & { __db?: Promise<Db> };
const g = globalThis as G;

/** Idempotent schema + in-place migrations. Exported for the migration test. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','store')),
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  dimension TEXT NOT NULL DEFAULT '',
  uom TEXT NOT NULL DEFAULT 'PCS',
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  min_stock INT CHECK (min_stock IS NULL OR min_stock >= 0),
  current_stock INT NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  source_sn INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  previous_stock INT NOT NULL CHECK (previous_stock >= 0),
  new_stock INT NOT NULL CHECK (new_stock >= 0),
  amount NUMERIC(14,2) CHECK (amount IS NULL OR amount >= 0),
  reason TEXT,
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS source_movement_id INT REFERENCES stock_movements(id);
-- Movement rules as named constraints. Replaces the unnamed checks older databases were created with,
-- so existing databases migrate in place on start-up. Idempotent.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_type_check') THEN
    ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_type_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_check') THEN
    ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_needs_source') THEN
    ALTER TABLE stock_movements DROP CONSTRAINT return_needs_source;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movement_type_valid') THEN
    ALTER TABLE stock_movements ADD CONSTRAINT movement_type_valid
      CHECK (type IN ('opening','in','sale','damage','return','adjustment'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movement_balance_valid') THEN
    ALTER TABLE stock_movements ADD CONSTRAINT movement_balance_valid CHECK (
      (type IN ('opening','in','return') AND new_stock = previous_stock + quantity) OR
      (type IN ('sale','damage') AND new_stock = previous_stock - quantity) OR
      (type = 'adjustment' AND (new_stock = previous_stock + quantity OR new_stock = previous_stock - quantity))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movement_source_valid') THEN
    ALTER TABLE stock_movements ADD CONSTRAINT movement_source_valid CHECK (
      (type <> 'return' OR source_movement_id IS NOT NULL) AND
      (type IN ('return','adjustment') OR source_movement_id IS NULL)
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_mov_source ON stock_movements(source_movement_id);
CREATE INDEX IF NOT EXISTS idx_mov_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mov_created ON stock_movements(created_at DESC);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
DROP TRIGGER IF EXISTS trg_return_source ON stock_movements;
DROP FUNCTION IF EXISTS check_return_source();
-- Linked movements: a Return must come from a sale and never exceed what was (effectively) sold;
-- a Correction must target an opening/stock-in/sale/damage entry of the same product and cannot
-- make that entry negative, or push a sale below what has already been returned from it.
CREATE OR REPLACE FUNCTION check_movement_source() RETURNS trigger AS $$
DECLARE src stock_movements%ROWTYPE; prior INT; already INT; effective INT;
BEGIN
  IF NEW.source_movement_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO src FROM stock_movements WHERE id = NEW.source_movement_id;
  IF NOT FOUND OR src.product_id <> NEW.product_id THEN
    RAISE EXCEPTION 'a linked movement must belong to the same product';
  END IF;
  SELECT COALESCE(sum(a.new_stock - a.previous_stock),0) INTO prior
    FROM stock_movements a WHERE a.source_movement_id = src.id AND a.type = 'adjustment';
  SELECT COALESCE(sum(r.quantity),0) INTO already
    FROM stock_movements r WHERE r.source_movement_id = src.id AND r.type = 'return';
  IF NEW.type = 'adjustment' THEN
    IF src.type NOT IN ('opening','in','sale','damage') THEN
      RAISE EXCEPTION 'only opening, stock in, sale and damage entries can be corrected';
    END IF;
    IF src.type IN ('opening','in') THEN
      effective := src.quantity + prior + (NEW.new_stock - NEW.previous_stock);
    ELSE
      effective := src.quantity - prior - (NEW.new_stock - NEW.previous_stock);
    END IF;
    IF effective < 0 THEN RAISE EXCEPTION 'a correction cannot make an entry negative'; END IF;
    IF src.type = 'sale' AND effective < already THEN
      RAISE EXCEPTION 'a sale cannot be corrected below what has been returned from it';
    END IF;
    RETURN NEW;
  END IF;
  IF src.type <> 'sale' THEN RAISE EXCEPTION 'a return must reference a sale of the same product'; END IF;
  IF already + NEW.quantity > src.quantity - prior THEN
    RAISE EXCEPTION 'total returned would exceed the quantity sold';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_movement_source ON stock_movements;
CREATE TRIGGER trg_movement_source BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION check_movement_source();
CREATE OR REPLACE FUNCTION forbid_movement_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only';
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_movements_immutable ON stock_movements;
CREATE TRIGGER trg_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_movement_change();
`;

async function seed(handle: Db) {
  const adminPw = process.env.ADMIN_PASSWORD || "admin123";
  const storePw = process.env.STORE_PASSWORD || "store123";
  await handle.transaction(async (tx) => {
    const a = await tx.query<{ id: number }>(
      "INSERT INTO users (username,name,role,password_hash) VALUES ('admin','Admin','admin',$1) RETURNING id",
      [hashPassword(adminPw)],
    );
    await tx.query(
      "INSERT INTO users (username,name,role,password_hash) VALUES ('store','Store','store',$1)",
      [hashPassword(storePw)],
    );
    const settings: [string, string][] = [
      ["company_name", "Conqueron Trading plc"],
      ["currency", "ETB"],
      ["timezone", "Africa/Addis_Ababa"],
      ["store_can_damage", "true"],
    ];
    for (const [k, v] of settings) await tx.query("INSERT INTO settings VALUES ($1,$2)", [k, v]);

    const file = path.join(process.cwd(), "data", "catalog.json");
    const catalog = JSON.parse(fs.readFileSync(file, "utf8")) as {
      sn: number; name: string; sku: string; dimension: string; qty: number; uom: string;
    }[];
    for (const p of catalog) {
      const r = await tx.query<{ id: number }>(
        "INSERT INTO products (sku,name,dimension,uom,current_stock,source_sn) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        [p.sku, p.name, p.dimension, p.uom, p.qty, p.sn],
      );
      await tx.query(
        "INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,created_by) VALUES ($1,'opening',$2,0,$2,$3)",
        [r[0].id, p.qty, a[0].id],
      );
    }
  });
}

/** Note: on a fresh database, two processes cold-starting at the exact same instant could both
 *  attempt this seed. Every table it inserts into has a unique constraint (username, sku, category
 *  name), so the loser fails harmlessly and the database ends up correct either way. This only
 *  matters for the first request ever made against a brand-new database. */
async function ensureReady(handle: Db) {
  await handle.exec(SCHEMA);
  const rows = await handle.query<{ n: number }>("SELECT count(*)::int AS n FROM users");
  if (rows[0].n === 0) await seed(handle);
}

async function pgHandle(): Promise<Db> {
  const { Pool } = await import("pg");
  const url = process.env.DATABASE_URL!;
  const pool = new Pool({
    connectionString: url,
    max: 5,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  const handle: Db = {
    async query(sql, params = []) {
      return (await pool.query(sql, params as unknown[])).rows;
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx: Tx = { query: async (sql, params = []) => (await client.query(sql, params as unknown[])).rows };
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
  await ensureReady(handle);
  return handle;
}

async function pgliteHandle(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGDATA_DIR || path.join(process.cwd(), "data", "pgdata");
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  await client.waitReady;
  const handle: Db = {
    query: async (sql, params = []) => (await client.query(sql, params as unknown[])).rows as never,
    exec: async (sql) => { await client.exec(sql); },
    transaction: (fn) => client.transaction((tx) => fn({ query: async (sql, params = []) => (await tx.query(sql, params as unknown[])).rows as never })),
  };
  await ensureReady(handle);
  return handle;
}

export function getDb(): Promise<Db> {
  if (!g.__db) g.__db = process.env.DATABASE_URL ? pgHandle() : pgliteHandle();
  return g.__db;
}

export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.query<T>(sql, params);
}
