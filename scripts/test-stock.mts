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

console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
