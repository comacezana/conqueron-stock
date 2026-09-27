import { q } from "./db";
import { statusOf, type StockStatus } from "./types";

/**
 * Monthly inventory report, rebuilt from the append-only stock ledger.
 * Movements are never edited, so a closed month always reproduces the same figures.
 * Quantities only: no prices, revenue or other financial figures.
 */

export interface ReportRow {
  id: number; sku: string; name: string; dimension: string; uom: string; category: string | null;
  min_stock: number | null; archived: boolean;
  start: number; opening: number; stock_in: number; returned: number; sold: number; damaged: number;
  /** Net of Admin corrections this month (can be negative). */
  corrected: number;
  end: number;
  movements: number;
}
export interface MonthlyReport {
  month: string;        // "2026-09"
  label: string;        // "September 2026"
  inProgress: boolean;  // current month: figures are month-to-date
  timezone: string;
  rows: (ReportRow & { status: StockStatus; reconciles: boolean })[];
  totals: { uom: string; start: number; opening: number; stock_in: number; returned: number; sold: number; damaged: number; corrected: number; end: number; products: number }[];
  counts: { products: number; movements: number; out: number; low: number; unset: number; mismatched: number };
}

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 1));
}

/** "YYYY-MM" for a date, as seen in the given timezone. */
export function monthOf(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Every month from the first recorded movement up to the current month, newest first. */
export async function reportMonths(tz: string): Promise<string[]> {
  const [first] = await q<{ t: Date | null }>("SELECT min(created_at) t FROM stock_movements");
  const current = monthOf(new Date(), tz);
  if (!first?.t) return [current];
  const out: string[] = [];
  for (let m = current, start = monthOf(new Date(first.t), tz); m >= start; m = shiftMonth(m, -1)) out.push(m);
  return out;
}

export async function monthlyReport(month: string, tz: string): Promise<MonthlyReport> {
  if (!MONTH_RE.test(month)) throw new Error("Invalid month");
  // Balances come from the ledger chain (latest movement by id before each boundary); id order is
  // the true per-product order because every movement is written under a row lock on its product.
  const rows = await q<ReportRow>(
    `WITH b AS (
       SELECT ($1::date::timestamp AT TIME ZONE $2::text) AS s,
              (($1::date + interval '1 month')::timestamp AT TIME ZONE $2::text) AS e
     )
     SELECT p.id, p.sku, p.name, p.dimension, p.uom, c.name AS category, p.min_stock, p.archived,
       COALESCE((SELECT x.new_stock FROM stock_movements x WHERE x.product_id = p.id AND x.created_at < b.s ORDER BY x.id DESC LIMIT 1), 0)::int AS start,
       COALESCE(sum(m.quantity) FILTER (WHERE m.type = 'opening'), 0)::int AS opening,
       COALESCE(sum(m.quantity) FILTER (WHERE m.type = 'in'), 0)::int AS stock_in,
       COALESCE(sum(m.quantity) FILTER (WHERE m.type = 'return'), 0)::int AS returned,
       COALESCE(sum(m.quantity) FILTER (WHERE m.type = 'sale'), 0)::int AS sold,
       COALESCE(sum(m.quantity) FILTER (WHERE m.type = 'damage'), 0)::int AS damaged,
       COALESCE(sum(m.new_stock - m.previous_stock) FILTER (WHERE m.type = 'adjustment'), 0)::int AS corrected,
       COALESCE((SELECT x.new_stock FROM stock_movements x WHERE x.product_id = p.id AND x.created_at < b.e ORDER BY x.id DESC LIMIT 1), 0)::int AS "end",
       count(m.id)::int AS movements
     FROM products p
     CROSS JOIN b
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN stock_movements m ON m.product_id = p.id AND m.created_at >= b.s AND m.created_at < b.e
     WHERE EXISTS (SELECT 1 FROM stock_movements x WHERE x.product_id = p.id AND x.created_at < b.e)
     GROUP BY p.id, c.name, b.s, b.e
     ORDER BY p.source_sn NULLS LAST, p.name`,
    [`${month}-01`, tz],
  );

  const full = rows.map((r) => ({
    ...r,
    status: statusOf(r.end, r.min_stock),
    reconciles: r.start + r.opening + r.stock_in + r.returned - r.sold - r.damaged + r.corrected === r.end,
  }));

  const byUom = new Map<string, MonthlyReport["totals"][number]>();
  for (const r of full) {
    const t = byUom.get(r.uom) ?? { uom: r.uom, start: 0, opening: 0, stock_in: 0, returned: 0, sold: 0, damaged: 0, corrected: 0, end: 0, products: 0 };
    t.start += r.start; t.opening += r.opening; t.stock_in += r.stock_in; t.returned += r.returned;
    t.sold += r.sold; t.damaged += r.damaged; t.corrected += r.corrected; t.end += r.end; t.products += 1;
    byUom.set(r.uom, t);
  }

  return {
    month,
    label: monthLabel(month),
    inProgress: month >= monthOf(new Date(), tz),
    timezone: tz,
    rows: full,
    totals: [...byUom.values()].sort((a, b) => a.uom.localeCompare(b.uom)),
    counts: {
      products: full.length,
      movements: full.reduce((n, r) => n + r.movements, 0),
      out: full.filter((r) => r.status === "out").length,
      low: full.filter((r) => r.status === "low").length,
      unset: full.filter((r) => r.status === "unset").length,
      mismatched: full.filter((r) => !r.reconciles).length,
    },
  };
}
