import Link from "next/link";
import type { ReactNode } from "react";
import type { MovementRow, MovementType, ProductRow, StockStatus } from "@/lib/types";
import { MOVEMENT_LABEL, movementNo, statusOf } from "@/lib/types";
import { money, num, signed, when } from "@/lib/format";
import type { Settings } from "@/lib/auth";
import { ArrowUUpLeft, Minus, Plus, Warning } from "@phosphor-icons/react/dist/ssr";

const LABEL: Record<StockStatus, string> = { in: "IN STOCK", low: "LOW STOCK", out: "OUT OF STOCK", unset: "MINIMUM NOT SET" };
export const StatusBadge = ({ stock, min }: { stock: number; min: number | null }) => {
  const s = statusOf(stock, min);
  return <span className={`badge ${s}`}>{LABEL[s]}</span>;
};

export function PageHead({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="head">
      <div><h1>{title}</h1>{desc && <p>{desc}</p>}</div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="empty"><h3>{title}</h3>{children}</div>
);

export function StockActions({ id, admin, storeCanDamage, size = "sm" }: { id: number; admin: boolean; storeCanDamage: boolean; size?: "sm" | "md" }) {
  const all = size === "md";
  const c = size === "sm" ? "btn sm" : "btn";
  return (
    <>
      <Link className={c} href={`/stock/in?product=${id}`}><Plus size={14} weight="bold" />Stock In</Link>
      <Link className={c} href={`/stock/sale?product=${id}`}><Minus size={14} weight="bold" />Sale</Link>
      {all && (admin || storeCanDamage) && <Link className={c} href={`/stock/damage?product=${id}`}><Warning size={14} />Damage</Link>}
      {all && admin && <Link className={c} href={`/stock/return?product=${id}`}><ArrowUUpLeft size={14} />Return</Link>}
    </>
  );
}

export function InventoryTable({ rows, admin, storeCanDamage }: { rows: ProductRow[]; admin: boolean; storeCanDamage: boolean }) {
  return (
    <div className="tablewrap">
      <table className="t stack">
        <thead>
          <tr>
            <th>Product</th><th>SKU</th><th>Category</th><th>Dimension</th><th>UOM</th>
            <th className="r">Current stock</th><th className="r">Minimum</th><th>Status</th><th><span className="sr">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="pname"><Link href={`/products/${p.id}`} className="link" style={{ color: "inherit" }}>{p.name}</Link>{p.archived && <span className="tag" style={{ marginLeft: 8 }}>Archived</span>}</td>
              <td className="sku">{p.sku}</td>
              <td className="hide-s dim">{p.category ?? "—"}</td>
              <td>{p.dimension || "—"}</td>
              <td className="hide-s">{p.uom}</td>
              <td className="stock">{num(p.current_stock)}<span className="dim" style={{ fontFamily: "var(--sans)", fontSize: 12, fontWeight: 400 }}> {p.uom}</span></td>
              <td className="hide-s r num dim">{p.min_stock === null ? "—" : num(p.min_stock)}</td>
              <td><StatusBadge stock={p.current_stock} min={p.min_stock} /></td>
              <td className="actcell">
                {!p.archived && <div className="rowact"><StockActions id={p.id} admin={admin} storeCanDamage={storeCanDamage} /></div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TAG: Record<MovementType, string> = { opening: "open", in: "up", return: "up", sale: "down", damage: "down" };
export const TypeTag = ({ t }: { t: MovementType }) => <span className={`tag ${TAG[t]}`}>{MOVEMENT_LABEL[t]}</span>;

export function HistoryTable({ rows, s, showProduct = true }: { rows: MovementRow[]; s: Settings; showProduct?: boolean }) {
  return (
    <div className="tablewrap">
      <table className="t stack">
        <thead>
          <tr>
            <th>No.</th><th>Date / time</th>{showProduct && <th>Product</th>}<th>Type</th>
            <th className="r">Qty</th><th className="r">Previous</th><th className="r">New</th><th>User</th><th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td className="num"><Link href={`/history/${m.id}`} className="link">{movementNo(m.id)}</Link></td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>{when(m.created_at, s.timezone)}</td>
              {showProduct && (
                <td className="pname">
                  <Link href={`/products/${m.product_id}`} style={{ fontWeight: 550 }}>{m.name}</Link>
                  <div className="dim"><span className="mono">{m.sku}</span> · {m.dimension}</div>
                </td>
              )}
              <td><TypeTag t={m.type} /></td>
              <td className={`num r ${m.type === "sale" || m.type === "damage" ? "neg" : "pos"}`} style={{ fontWeight: 650 }}>{signed(m.type, m.quantity)} <span className="dim">{m.uom}</span></td>
              <td className="hide-s num r dim">{num(m.previous_stock)}</td>
              <td className="num r" style={{ fontWeight: 600 }}>{num(m.new_stock)}</td>
              <td className="hide-s">{m.user_name} <span className="dim">({m.user_role})</span></td>
              <td className="hide-s dim">
                {m.amount !== null && <div>{m.type === "sale" ? "Amount sold" : "Return amount"}: {money(m.amount, s.currency)}</div>}
                {m.reason && <div>{m.reason}</div>}
                {m.type === "sale" && m.returned > 0 && (
                  <div>{m.returned >= m.quantity ? "Fully returned" : `Returned ${num(m.returned)} of ${num(m.quantity)}`}</div>
                )}
                {m.source_movement_id && <div>Source sale <Link href={`/history/${m.source_movement_id}`} className="link">{movementNo(m.source_movement_id)}</Link></div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, size, total, base }: { page: number; size: number; total: number; base: URLSearchParams }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => { const u = new URLSearchParams(base); u.set("page", String(p)); return `?${u}`; };
  return (
    <div className="pager">
      <span>Page {page} of {pages} · {num(total)} records</span>
      <div className="actions">
        {page > 1 && <Link className="btn sm" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn sm" href={href(page + 1)}>Next</Link>}
      </div>
    </div>
  );
}
