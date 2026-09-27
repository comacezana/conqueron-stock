import { q } from "./db";
import type { MovementRow, ProductRow } from "./types";

export type SP = Record<string, string | string[] | undefined>;
export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const PRODUCT_SELECT = `
  SELECT p.id,p.sku,p.name,p.description,p.dimension,p.uom,p.category_id,c.name AS category,
         p.min_stock,p.current_stock,p.archived
  FROM products p LEFT JOIN categories c ON c.id=p.category_id`;

export interface ProductFilters {
  search?: string; category?: string; status?: string; dimension?: string; uom?: string;
  type?: string; from?: string; to?: string; includeArchived?: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function productFiltersFrom(sp: SP): ProductFilters {
  return {
    search: first(sp.q), category: first(sp.category), status: first(sp.status), dimension: first(sp.dimension),
    uom: first(sp.uom), type: first(sp.type), from: first(sp.from), to: first(sp.to),
  };
}

/** Every search token must match name, SKU, dimension or category (case-insensitive substring). */
export async function listProducts(f: ProductFilters, tz = "UTC"): Promise<ProductRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (v: unknown) => (params.push(v), `$${params.length}`);

  if (!f.includeArchived) where.push("p.archived = FALSE");
  for (const t of (f.search ?? "").trim().split(/\s+/).filter(Boolean)) {
    const p = add(`%${t.replace(/[\\%_]/g, "\\$&")}%`);
    where.push(`(p.name ILIKE ${p} OR p.sku ILIKE ${p} OR p.dimension ILIKE ${p} OR c.name ILIKE ${p} OR COALESCE(p.description,'') ILIKE ${p})`);
  }
  if (f.category === "none") where.push("p.category_id IS NULL");
  else if (f.category && /^\d+$/.test(f.category)) where.push(`p.category_id = ${add(Number(f.category))}`);
  if (f.dimension) where.push(`p.dimension = ${add(f.dimension)}`);
  if (f.uom) where.push(`p.uom = ${add(f.uom)}`);
  switch (f.status) {
    case "out": where.push("p.current_stock = 0"); break;
    case "low": where.push("p.current_stock > 0 AND p.min_stock IS NOT NULL AND p.current_stock <= p.min_stock"); break;
    case "in": where.push("p.min_stock IS NOT NULL AND p.current_stock > p.min_stock"); break;
    case "unset": where.push("p.current_stock > 0 AND p.min_stock IS NULL"); break;
  }
  const typeOk = f.type && ["opening", "in", "sale", "damage", "return"].includes(f.type);
  const fromOk = f.from && DATE.test(f.from);
  const toOk = f.to && DATE.test(f.to);
  if (typeOk || fromOk || toOk) {
    const m: string[] = ["m.product_id = p.id"];
    if (typeOk) m.push(`m.type = ${add(f.type)}`);
    if (fromOk) m.push(`m.created_at >= (${add(f.from)}::date::timestamp AT TIME ZONE ${add(tz)}::text)`);
    if (toOk) m.push(`m.created_at < ((${add(f.to)}::date + 1)::timestamp AT TIME ZONE ${add(tz)}::text)`);
    where.push(`EXISTS (SELECT 1 FROM stock_movements m WHERE ${m.join(" AND ")})`);
  }
  const sql = `${PRODUCT_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.archived, p.source_sn NULLS LAST, p.name`;
  return q<ProductRow>(sql, params);
}

export async function getProduct(id: number) {
  if (!Number.isInteger(id)) return null;
  return (await q<ProductRow>(`${PRODUCT_SELECT} WHERE p.id=$1`, [id]))[0] ?? null;
}

export async function filterOptions() {
  const [categories, dimensions, uoms] = await Promise.all([
    q<{ id: number; name: string }>("SELECT id,name FROM categories ORDER BY name"),
    q<{ dimension: string }>("SELECT DISTINCT dimension FROM products WHERE dimension<>'' ORDER BY dimension"),
    q<{ uom: string }>("SELECT DISTINCT uom FROM products ORDER BY uom"),
  ]);
  return { categories, dimensions: dimensions.map((d) => d.dimension), uoms: uoms.map((u) => u.uom) };
}

export interface MovementFilters {
  productId?: number; search?: string; type?: string; from?: string; to?: string; category?: string; user?: string;
  returnable?: boolean; limit?: number; offset?: number;
}

export async function listMovements(f: MovementFilters, tz: string): Promise<{ rows: MovementRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (v: unknown) => (params.push(v), `$${params.length}`);
  if (f.productId) where.push(`m.product_id = ${add(f.productId)}`);
  for (const t of (f.search ?? "").trim().split(/\s+/).filter(Boolean)) {
    const p = add(`%${t.replace(/[\\%_]/g, "\\$&")}%`);
    where.push(`(p.name ILIKE ${p} OR p.sku ILIKE ${p} OR p.dimension ILIKE ${p} OR COALESCE(c.name,'') ILIKE ${p} OR COALESCE(m.reason,'') ILIKE ${p})`);
  }
  if (f.type && ["opening", "in", "sale", "damage", "return"].includes(f.type)) where.push(`m.type = ${add(f.type)}`);
  if (f.category && /^\d+$/.test(f.category)) where.push(`p.category_id = ${add(Number(f.category))}`);
  if (f.user && /^\d+$/.test(f.user)) where.push(`m.created_by = ${add(Number(f.user))}`);
  if (f.from && DATE.test(f.from)) where.push(`m.created_at >= (${add(f.from)}::date::timestamp AT TIME ZONE ${add(tz)}::text)`);
  if (f.to && DATE.test(f.to)) where.push(`m.created_at < ((${add(f.to)}::date + 1)::timestamp AT TIME ZONE ${add(tz)}::text)`);
  if (f.returnable) where.push("m.type = 'sale' AND m.quantity > (SELECT COALESCE(sum(r.quantity),0) FROM stock_movements r WHERE r.source_movement_id = m.id) AND p.archived = FALSE");
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const from = `FROM stock_movements m JOIN products p ON p.id=m.product_id LEFT JOIN categories c ON c.id=p.category_id JOIN users u ON u.id=m.created_by`;
  const total = (await q<{ n: number }>(`SELECT count(*)::int n ${from} ${w}`, params))[0].n;
  const rows = await q<MovementRow>(
    `SELECT m.id,m.product_id,p.sku,p.name,p.dimension,p.uom,m.type,m.quantity,m.previous_stock,m.new_stock,m.amount,m.reason,
            m.created_by,u.name AS user_name,u.role AS user_role,m.created_at,m.source_movement_id,
            (SELECT COALESCE(sum(r.quantity),0)::int FROM stock_movements r WHERE r.source_movement_id = m.id) AS returned
     ${from} ${w} ORDER BY m.created_at DESC, m.id DESC LIMIT ${f.limit ?? 50} OFFSET ${f.offset ?? 0}`,
    params,
  );
  return { rows, total };
}

export async function dashboardStats() {
  const s = await q<{ total: number; low: number; out: number; unset: number }>(`
    SELECT count(*)::int total,
      count(*) FILTER (WHERE current_stock>0 AND min_stock IS NOT NULL AND current_stock<=min_stock)::int low,
      count(*) FILTER (WHERE current_stock=0)::int "out",
      count(*) FILTER (WHERE current_stock>0 AND min_stock IS NULL)::int unset
    FROM products WHERE archived=FALSE`);
  const byUom = await q<{ uom: string; stock: number; products: number }>(
    "SELECT uom, sum(current_stock)::int stock, count(*)::int products FROM products WHERE archived=FALSE GROUP BY uom ORDER BY uom");
  return { ...s[0], byUom };
}

const MOVEMENT_FROM = `FROM stock_movements m JOIN products p ON p.id=m.product_id JOIN users u ON u.id=m.created_by`;
const MOVEMENT_COLS = `m.id,m.product_id,p.sku,p.name,p.dimension,p.uom,m.type,m.quantity,m.previous_stock,m.new_stock,m.amount,m.reason,
  m.created_by,u.name AS user_name,u.role AS user_role,m.created_at,m.source_movement_id,
  (SELECT COALESCE(sum(r.quantity),0)::int FROM stock_movements r WHERE r.source_movement_id = m.id) AS returned`;

export async function getMovement(id: number): Promise<(MovementRow & { archived: boolean }) | null> {
  if (!Number.isInteger(id)) return null;
  return (await q<MovementRow & { archived: boolean }>(`SELECT ${MOVEMENT_COLS}, p.archived ${MOVEMENT_FROM} WHERE m.id=$1`, [id]))[0] ?? null;
}

export const listReturnsOf = (saleId: number) =>
  q<MovementRow>(`SELECT ${MOVEMENT_COLS} ${MOVEMENT_FROM} WHERE m.source_movement_id=$1 ORDER BY m.created_at, m.id`, [saleId]);
