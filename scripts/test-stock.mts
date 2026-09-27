// Run: npx tsx scripts/test-stock.mts   (uses a throwaway database)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PGDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "stock-test-"));

const { q } = await import("../lib/db");
const { recordMovement } = await import("../lib/stock");
type In = Parameters<typeof recordMovement>[0];

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

const admin = (await q<{ id: number }>("SELECT id FROM users WHERE role='admin'"))[0].id;
const store = (await q<{ id: number }>("SELECT id FROM users WHERE role='store'"))[0].id;
const A = { userId: admin, role: "admin" as const, storeCanDamage: true };
const S = { userId: store, role: "store" as const, storeCanDamage: true };

let n = 0;
async function product(stock: number) {
  n++;
  const r = await q<{ id: number }>("INSERT INTO products (sku,name,dimension,uom) VALUES ($1,'Test','110mm','PCS') RETURNING id", [`T-${n}`]);
  if (stock) await recordMovement({ productId: r[0].id, type: "opening", quantity: stock, ...A });
  return r[0].id;
}
const stockOf = async (id: number) => (await q<{ s: number }>("SELECT current_stock s FROM products WHERE id=$1", [id]))[0].s;
const run = (o: Partial<In> & Pick<In, "productId" | "type" | "quantity">, who = S) => recordMovement({ ...who, ...o } as In);
async function sale(pid: number, qty: number, amount: number | null = 5000) {
  const r = await run({ productId: pid, type: "sale", quantity: qty, amount });
  if (!r.ok) throw new Error(r.error);
  return (await q<{ id: number }>("SELECT max(id) id FROM stock_movements WHERE product_id=$1 AND type='sale'", [pid]))[0].id;
}
const ret = (saleId: number, qty: number, who = A) =>
  run({ productId: 0, type: "return", quantity: qty, sourceMovementId: saleId, reason: "Customer returned unused items", amount: 1000 }, who);
const returned = async (saleId: number) =>
  (await q<{ n: number }>("SELECT COALESCE(sum(quantity),0)::int n FROM stock_movements WHERE source_movement_id=$1", [saleId]))[0].n;

// 1-3 sales
let p = await product(100);
check("T1 sale 20 of 100 -> 80", (await run({ productId: p, type: "sale", quantity: 20 })).ok && (await stockOf(p)) === 80);
p = await product(100);
check("T2 sale exactly stock -> 0", (await run({ productId: p, type: "sale", quantity: 100 })).ok && (await stockOf(p)) === 0);
p = await product(100);
let r = await run({ productId: p, type: "sale", quantity: 101 });
check("T3 sale 101 of 100 rejected", !r.ok && r.error === "Insufficient stock. Only 100 PCS are available." && (await stockOf(p)) === 100, !r.ok ? r.error : "");
check("T3 rejected sale created no movement", (await q("SELECT 1 FROM stock_movements WHERE product_id=$1 AND type='sale'", [p])).length === 0);

// 4 full return
p = await product(100); let sid = await sale(p, 100);
check("T4 full return allowed", (await ret(sid, 100)).ok && (await returned(sid)) === 100 && (await stockOf(p)) === 100);
r = await ret(sid, 1);
check("T4 nothing returnable after full return", !r.ok, !r.ok ? r.error : "");

// 5 partial
p = await product(100); sid = await sale(p, 100);
check("T5 partial return 20 -> remaining 80", (await ret(sid, 20)).ok && 100 - (await returned(sid)) === 80);

// 6 multiple partial
p = await product(100); sid = await sale(p, 100);
const a = await ret(sid, 20), b = await ret(sid, 30), c = await ret(sid, 50);
check("T6 three partial returns 20+30+50", a.ok && b.ok && c.ok && (await returned(sid)) === 100 && (await stockOf(p)) === 100);

// 7 over-return
p = await product(100); sid = await sale(p, 100); await ret(sid, 80);
r = await ret(sid, 21);
check("T7 over-return rejected", !r.ok && r.error === "Cannot return 21 PCS. Only 20 PCS remain returnable from this sale." && (await returned(sid)) === 80, !r.ok ? r.error : "");
p = await product(200); sid = await sale(p, 100); await ret(sid, 20);
r = await ret(sid, 90);
check("T7b message: cannot return 90, 80 remain", !r.ok && r.error === "Cannot return 90 PCS. Only 80 PCS remain returnable from this sale.", !r.ok ? r.error : "");

// 8 return without sale / wrong source
p = await product(100);
r = await run({ productId: p, type: "return", quantity: 5, reason: "x" }, A);
check("T8 return without sale rejected", !r.ok, !r.ok ? r.error : "");
const stockIn = await run({ productId: p, type: "in", quantity: 10 });
const inId = (await q<{ id: number }>("SELECT max(id) id FROM stock_movements WHERE type='in'"))[0].id;
r = await ret(inId, 5);
check("T8 return against a Stock In rejected", stockIn.ok && !r.ok, !r.ok ? r.error : "");
r = await run({ productId: p, type: "in", quantity: 5, sourceMovementId: sid });
check("T8 Stock In cannot carry a source sale", !r.ok, !r.ok ? r.error : "");
let dbBlocked = false;
try { await q("INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,created_by) VALUES ($1,'return',1,0,1,$2)", [p, admin]); } catch { dbBlocked = true; }
check("T8 database itself refuses a return with no source", dbBlocked);
dbBlocked = false;
try { await q("INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,source_movement_id,created_by) VALUES ($1,'return',999,0,999,$2,$3)", [p, sid, admin]); } catch { dbBlocked = true; }
check("T8 database itself refuses over-return", dbBlocked);

// 9 store return
p = await product(100); sid = await sale(p, 50);
r = await ret(sid, 5, S);
check("T9 Store cannot process return", !r.ok && r.error === "Only Admin can process returns." && (await stockOf(p)) === 50, !r.ok ? r.error : "");

// 10 amount does not affect stock
const p1 = await product(100), p2 = await product(100);
await run({ productId: p1, type: "sale", quantity: 10, amount: 1 });
await run({ productId: p2, type: "sale", quantity: 10, amount: 999999 });
check("T10 amount does not change stock", (await stockOf(p1)) === 90 && (await stockOf(p2)) === 90);

// immutability
let mutated = false;
try { await q("UPDATE stock_movements SET quantity=10 WHERE id=$1", [sid]); mutated = true; } catch { /* expected */ }
try { await q("DELETE FROM stock_movements WHERE id=$1", [sid]); mutated = true; } catch { /* expected */ }
check("Sale is immutable (update/delete refused)", !mutated);

// concurrency: two simultaneous returns that together exceed the sale
p = await product(100); sid = await sale(p, 100);
const both = await Promise.all([ret(sid, 60), ret(sid, 60)]);
check("Concurrent over-return: exactly one wins", both.filter((x) => x.ok).length === 1 && (await returned(sid)) === 60);

// section 20 scenario
const e = (await q<{ id: number }>("INSERT INTO products (sku,name,dimension,uom) VALUES ('E1-PV5-110-T','Swept Elbow','110mm','PCS') RETURNING id"))[0].id;
await run({ productId: e, type: "opening", quantity: 1500 }, A);
await run({ productId: e, type: "in", quantity: 500 });
const s3 = await sale(e, 100, 5000);
await run({ productId: e, type: "damage", quantity: 10, reason: "Damaged during handling" });
const rr = await ret(s3, 20);
const rows = await q<{ type: string; previous_stock: number; new_stock: number; source_movement_id: number | null }>(
  "SELECT type,previous_stock,new_stock,source_movement_id FROM stock_movements WHERE product_id=$1 ORDER BY id", [e]);
const seq = rows.map((x) => `${x.type}:${x.previous_stock}>${x.new_stock}`).join(" ");
check("Scenario ledger", seq === "opening:0>1500 in:1500>2000 sale:2000>1900 damage:1900>1890 return:1890>1910", seq);
check("Scenario final stock 1910 and return linked to sale", rr.ok && (await stockOf(e)) === 1910 && rows[4].source_movement_id === s3);
check("Scenario original sale still 100", (await q<{ quantity: number }>("SELECT quantity FROM stock_movements WHERE id=$1", [s3]))[0].quantity === 100);
check("Stock In has no source", rows[1].source_movement_id === null);

// ledger reconciles with balances
const rec = (await q<{ bad: number }>(`
  SELECT count(*)::int bad FROM products p WHERE p.current_stock <>
   COALESCE((SELECT sum(CASE WHEN type IN ('opening','in','return') THEN quantity ELSE -quantity END) FROM stock_movements WHERE product_id=p.id),0)`))[0].bad;
check("All product balances equal their movement ledger", rec === 0);

// ---------- monthly reports ----------
const { monthlyReport, monthOf, shiftMonth, reportMonths } = await import("../lib/reports");
const { renderReportPdf } = await import("../lib/pdf");
const { PDFDocument } = await import("pdf-lib");
const TZ = "Africa/Addis_Ababa"; // UTC+3, no daylight saving
const cur = monthOf(new Date(), TZ), m1 = shiftMonth(cur, -3), m2 = shiftMonth(cur, -2);

// Backdated ledger for one product. Inserts are allowed; only UPDATE/DELETE of movements is blocked.
const R = (await q<{ id: number }>("INSERT INTO products (sku,name,dimension,uom,min_stock) VALUES ('RPT-1','Report test elbow','110mm','PCS',600) RETURNING id"))[0].id;
const back: [string, string, number, number, number][] = [
  [`${m1}-10T10:00:00+03:00`, "opening", 500, 0, 500],
  [`${m1}-20T10:00:00+03:00`, "in", 200, 500, 700],
  [`${m2}-01T01:00:00+03:00`, "sale", 150, 700, 550],   // 1am local on the 1st = still the previous month in UTC
  [`${m2}-15T10:00:00+03:00`, "damage", 20, 550, 530],
];
for (const [at, type, qty, prev, next] of back)
  await q("INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,reason,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [R, type, qty, prev, next, type === "damage" ? "test" : null, admin, at]);
await q("UPDATE products SET current_stock=530 WHERE id=$1", [R]);
await run({ productId: R, type: "in", quantity: 30 });

const rowOf = (r: Awaited<ReturnType<typeof monthlyReport>>) => r.rows.find((x) => x.id === R);
const rep1 = await monthlyReport(m1, TZ), rep2 = await monthlyReport(m2, TZ), repC = await monthlyReport(cur, TZ);
let x = rowOf(rep1);
check("Report month 1: start 0 + opening 500 + in 200 = end 700", !!x && x.start === 0 && x.opening === 500 && x.stock_in === 200 && x.sold === 0 && x.end === 700 && x.reconciles, JSON.stringify(x && { s: x.start, o: x.opening, i: x.stock_in, sold: x.sold, e: x.end }));
check("Report month 1 only lists products that existed by then", rep1.rows.length === 1 && !rep1.inProgress);
check("Report month 1 status uses minimum (700 > 600 = in stock)", x?.status === "in");
x = rowOf(await monthlyReport(m1, "UTC"));
check("Timezone boundary: in UTC the 1am sale falls in month 1", !!x && x.sold === 150 && x.end === 550);
x = rowOf(rep2);
check("Report month 2: start 700 - sale 150 - damage 20 = end 530", !!x && x.start === 700 && x.sold === 150 && x.damaged === 20 && x.end === 530 && x.reconciles);
check("Report month 2 status low (530 <= 600)", x?.status === "low");
x = rowOf(repC);
check("Current month: start 530 + in 30 = 560 = live stock", !!x && x.start === 530 && x.stock_in === 30 && x.end === 560 && x.end === (await stockOf(R)) && repC.inProgress);
check("Current month: every product reconciles", repC.counts.mismatched === 0 && repC.rows.length > 56, `${repC.rows.length} rows, ${repC.counts.mismatched} mismatched`);
const endSum = repC.rows.reduce((n, r) => n + r.end, 0);
const liveSum = (await q<{ s: number }>("SELECT sum(current_stock)::int s FROM products p WHERE EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id=p.id)"))[0].s;
check("Current month end totals equal live stock totals", endSum === liveSum, `${endSum} vs ${liveSum}`);
const months = await reportMonths(TZ);
check("Month list runs newest first from first movement", months[0] === cur && months.includes(m2) && months.at(-1) === m1, months.join(","));

// PDF: non-Latin characters must not crash the renderer
const odd = (await q<{ id: number }>("INSERT INTO products (sku,name,dimension,uom) VALUES ('RPT-2','Test ሀ fitting − °','50mm','PCS') RETURNING id"))[0].id;
await run({ productId: odd, type: "opening", quantity: 5 }, A);
const bytes = await renderReportPdf(await monthlyReport(cur, TZ), { company: "Conqueron Trading plc", generatedAt: "27 Sept 2026, 10:00" });
const pdf = await PDFDocument.load(bytes);
check("PDF renders, is a real PDF, and paginates", Buffer.from(bytes.slice(0, 5)).toString() === "%PDF-" && pdf.getPageCount() >= 2, `${bytes.length} bytes, ${pdf.getPageCount()} pages`);

const { parseRecipients, emailReport } = await import("../lib/mail");
const pr = parseRecipients("a@x.com, B@x.com; a@x.com bad-address");
check("Recipient parsing dedupes and flags bad addresses", pr.ok.join() === "a@x.com,b@x.com" && pr.bad.join() === "bad-address");
delete process.env.SMTP_HOST;
const em = await emailReport(cur, ["a@x.com"]);
check("Email refuses cleanly when SMTP is not configured", !em.ok && em.error.includes("SMTP"), !em.ok ? em.error : "");

// ---------- Admin stock corrections ----------
const { recordCorrection } = await import("../lib/stock");
const { getMovement } = await import("../lib/queries");
const C = (o: Partial<Parameters<typeof recordCorrection>[0]>) =>
  recordCorrection({ userId: admin, role: "admin", target: 0, reason: "Typed wrong", ...o } as Parameters<typeof recordCorrection>[0]);
const lastId = async (pid: number, type: string) =>
  (await q<{ id: number }>("SELECT max(id) id FROM stock_movements WHERE product_id=$1 AND type=$2", [pid, type]))[0].id;
const rowById = async (id: number) =>
  (await q<{ quantity: number; previous_stock: number; new_stock: number; reason: string; source_movement_id: number | null }>("SELECT * FROM stock_movements WHERE id=$1", [id]))[0];

// The exact case: opening typed 15000 instead of 1500
p = await product(15000);
const openId = await lastId(p, "opening");
let cr = await C({ sourceMovementId: openId, target: 1500, reason: "Typed 15000 instead of 1500" });
const fix = await rowById(await lastId(p, "adjustment"));
check("Correct opening 15000 -> 1500: stock becomes 1500", cr.ok && (await stockOf(p)) === 1500, !cr.ok ? cr.error : "");
check("Original opening row is untouched (still 15000)", (await rowById(openId)).quantity === 15000);
check("Correction row: -13500, 15000 -> 1500, linked, with reason",
  fix.quantity === 13500 && fix.previous_stock === 15000 && fix.new_stock === 1500 && fix.source_movement_id === openId && fix.reason === "Typed 15000 instead of 1500");
check("Entry now counts as 1500", (await getMovement(openId))!.corrected_quantity === 1500);
cr = await C({ sourceMovementId: openId, target: 1600 });
check("Correct the same entry again (1500 -> 1600): +100", cr.ok && (await stockOf(p)) === 1600 && (await getMovement(openId))!.corrected_quantity === 1600);
cr = await C({ sourceMovementId: openId, target: 1600 });
check("No-op correction rejected", !cr.ok && cr.error.includes("Nothing to change"), !cr.ok ? cr.error : "");

// Stock In typo with sales in between
p = await product(100);
await run({ productId: p, type: "in", quantity: 15000 });
const typoInId = await lastId(p, "in");
await run({ productId: p, type: "sale", quantity: 200 });
cr = await C({ sourceMovementId: typoInId, target: 1500 });
check("Stock In 15000 -> 1500 after a sale of 200: 14900 -> 1400", cr.ok && (await stockOf(p)) === 1400);

// Physical count
cr = await C({ productId: p, target: 1380, reason: "Count on shelf" });
check("Count correction 1400 -> 1380", cr.ok && (await stockOf(p)) === 1380 && (await rowById(await lastId(p, "adjustment"))).source_movement_id === null);
cr = await C({ productId: p, target: 1, reason: "   " });
check("Correction without a reason rejected", !cr.ok && cr.error.includes("reason"), !cr.ok ? cr.error : "");

// Cannot go negative
p = await product(0);
await run({ productId: p, type: "in", quantity: 1000 });
const in2 = await lastId(p, "in");
await run({ productId: p, type: "sale", quantity: 950 });
cr = await C({ sourceMovementId: in2, target: 0 });
check("Correction that would make stock negative is rejected, nothing saved",
  !cr.ok && cr.error.includes("below zero") && (await stockOf(p)) === 50 && (await q("SELECT 1 FROM stock_movements WHERE product_id=$1 AND type='adjustment'", [p])).length === 0, !cr.ok ? cr.error : "");

// Permissions and entry types
cr = await recordCorrection({ productId: p, target: 10, reason: "x", userId: store, role: "store" });
check("Store cannot correct stock", !cr.ok && cr.error === "Only Admin can correct stock.");
r = await run({ productId: p, type: "adjustment", quantity: 5 }, A);
check("Regular movement path refuses corrections", !r.ok);

// Sale corrections change what can be returned
p = await product(500);
sid = await sale(p, 100);
cr = await C({ sourceMovementId: sid, target: 10 });
check("Sale typed 100, really 10: stock back +90 (400 -> 490)", cr.ok && (await stockOf(p)) === 490);
r = await ret(sid, 11);
check("Return capped by corrected sale (11 of 10 rejected)", !r.ok && r.error.includes("Only 10 PCS remain"), !r.ok ? r.error : "");
check("Return of 10 allowed", (await ret(sid, 10)).ok && (await stockOf(p)) === 500);
cr = await C({ sourceMovementId: sid, target: 5 });
check("Sale cannot be corrected below what was returned", !cr.ok && cr.error.includes("cannot be set below 10"), !cr.ok ? cr.error : "");
const sid2 = await sale(p, 10);
cr = await C({ sourceMovementId: sid2, target: 30 });
check("Sale typed 10, really 30: stock -20, returnable 30", cr.ok && (await stockOf(p)) === 470 && (await getMovement(sid2))!.corrected_quantity === 30);
const retId = await lastId(p, "return");
cr = await C({ sourceMovementId: retId, target: 1 });
check("Returns cannot be corrected by entry", !cr.ok);
cr = await C({ sourceMovementId: await lastId(p, "adjustment"), target: 1 });
check("Corrections cannot be corrected by entry", !cr.ok);

// Database-level guards (defence if app checks are bypassed)
const refused = async (sql: string, params: unknown[]) => { try { await q(sql, params); return false; } catch { return true; } };
const cur2 = await stockOf(p);
check("DB refuses correction linked to a return",
  await refused("INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,source_movement_id,created_by) VALUES ($1,'adjustment',1,$2,$3,$4,$5)", [p, cur2, cur2 + 1, retId, admin]));
check("DB refuses correction with wrong balance math",
  await refused("INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,created_by) VALUES ($1,'adjustment',5,$2,$3,$4)", [p, cur2, cur2 + 7, admin]));
check("DB refuses correction linked to another product's entry",
  await refused("INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,source_movement_id,created_by) VALUES ($1,'adjustment',1,$2,$3,$4,$5)", [p, cur2, cur2 + 1, openId, admin]));
check("Corrections are immutable too",
  await refused("UPDATE stock_movements SET quantity=1 WHERE type='adjustment'", []));

// Reports still reconcile with corrections in the month
const repFix = await monthlyReport(cur, TZ);
check("Report reconciles every row including corrections", repFix.counts.mismatched === 0 && repFix.rows.some((x) => x.corrected !== 0), `${repFix.counts.mismatched} mismatched`);
check("Report end total still equals live stock",
  repFix.rows.reduce((t, x) => t + x.end, 0) === (await q<{ s: number }>("SELECT sum(current_stock)::int s FROM products p WHERE EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id=p.id)"))[0].s);
check("Everything still reconciles with the ledger", (await q<{ bad: number }>(`
  SELECT count(*)::int bad FROM products p WHERE p.current_stock <>
   COALESCE((SELECT new_stock FROM stock_movements WHERE product_id=p.id ORDER BY id DESC LIMIT 1), 0)`))[0].bad === 0);

// ---------- migration of a database created by the previous version ----------
{
  const { SCHEMA } = await import("../lib/db");
  const { PGlite } = await import("@electric-sql/pglite");
  const old = new PGlite(fs.mkdtempSync(path.join(os.tmpdir(), "stock-old-")));
  await old.exec(`
    CREATE TABLE users (id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','store')), password_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
    CREATE TABLE products (id SERIAL PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
      dimension TEXT NOT NULL DEFAULT '', uom TEXT NOT NULL DEFAULT 'PCS', category_id INT REFERENCES categories(id) ON DELETE SET NULL,
      min_stock INT CHECK (min_stock IS NULL OR min_stock >= 0), current_stock INT NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
      archived BOOLEAN NOT NULL DEFAULT FALSE, source_sn INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE stock_movements (id SERIAL PRIMARY KEY, product_id INT NOT NULL REFERENCES products(id),
      type TEXT NOT NULL CHECK (type IN ('opening','in','sale','damage','return')),
      quantity INT NOT NULL CHECK (quantity > 0), previous_stock INT NOT NULL CHECK (previous_stock >= 0),
      new_stock INT NOT NULL CHECK (new_stock >= 0), amount NUMERIC(14,2) CHECK (amount IS NULL OR amount >= 0), reason TEXT,
      created_by INT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK ((type IN ('opening','in','return') AND new_stock = previous_stock + quantity) OR
             (type IN ('sale','damage') AND new_stock = previous_stock - quantity)));
    ALTER TABLE stock_movements ADD COLUMN source_movement_id INT REFERENCES stock_movements(id);
    ALTER TABLE stock_movements ADD CONSTRAINT return_needs_source CHECK ((type = 'return') = (source_movement_id IS NOT NULL)) NOT VALID;
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO users (username,name,role,password_hash) VALUES ('admin','Admin','admin','x');
    INSERT INTO products (sku,name,current_stock) VALUES ('OLD-1','Old product',15000);
    INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,created_by) VALUES (1,'opening',15000,0,15000,1);
  `);
  const names = async () => (await old.query<{ conname: string }>("SELECT conname FROM pg_constraint WHERE conrelid = 'stock_movements'::regclass AND contype = 'c' ORDER BY 1")).rows.map((x) => x.conname);
  const before = await names();
  await old.exec(SCHEMA);
  await old.exec(SCHEMA); // must be idempotent: runs on every start
  const after = await names();
  check("Old DB had the unnamed checks", before.includes("stock_movements_type_check") && before.includes("stock_movements_check") && before.includes("return_needs_source"), before.join(","));
  check("Migration swaps them for named rules, idempotently",
    !after.includes("stock_movements_type_check") && !after.includes("stock_movements_check") && !after.includes("return_needs_source")
    && ["movement_type_valid", "movement_balance_valid", "movement_source_valid"].every((x) => after.includes(x)), after.join(","));
  let okInsert = true;
  try {
    await old.query("INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,reason,source_movement_id,created_by) VALUES (1,'adjustment',13500,15000,1500,'typo',1,1)");
  } catch (e) { okInsert = false; console.log(String(e)); }
  check("Migrated DB accepts a linked correction and keeps old data", okInsert && (await old.query<{ n: number }>("SELECT count(*)::int n FROM stock_movements")).rows[0].n === 2);
  let blocked = false;
  try { await old.query("UPDATE stock_movements SET quantity = 1 WHERE id = 1"); } catch { blocked = true; }
  check("Migrated DB keeps history immutable", blocked);
  await old.close();
}

console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
