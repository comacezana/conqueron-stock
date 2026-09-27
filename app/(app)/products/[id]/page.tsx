import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettings, requireUser } from "@/lib/auth";
import { first, getProduct, listMovements, type SP } from "@/lib/queries";
import { num } from "@/lib/format";
import { MOVEMENT_LABEL } from "@/lib/types";
import FilterBar from "@/components/FilterBar";
import { Empty, HistoryTable, Pager, StatusBadge, StockActions } from "@/components/ui";

const SIZE = 25;

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const p = await getProduct(Number(id));
  if (!p) notFound();
  const s = await getSettings();
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const { rows, total } = await listMovements(
    { productId: p.id, type: first(sp.type), from: first(sp.from), to: first(sp.to), limit: SIZE, offset: (page - 1) * SIZE }, s.timezone);
  const base = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));
  const admin = user.role === "admin";

  return (
    <>
      <p className="crumb"><Link href="/inventory" className="link">Inventory</Link> / {p.sku}</p>
      {first(sp.corrected) && <div className="okmsg" role="status" style={{ marginBottom: 16 }}>Correction saved. Stock is now {num(p.current_stock)} {p.uom}.</div>}
      <div className="ph">
        <div>
          <h1 style={{ fontSize: 24, lineHeight: "32px", fontWeight: 650, letterSpacing: "-0.02em" }}>{p.name}</h1>
          <div className="kv">
            <div><small>SKU</small><b className="mono" style={{ userSelect: "all" }}>{p.sku}</b></div>
            <div><small>Dimension</small><b>{p.dimension || "-"}</b></div>
            <div><small>UOM</small><b>{p.uom}</b></div>
            <div><small>Category</small><b>{p.category ?? "-"}</b></div>
            <div><small>Minimum stock</small><b className="num">{p.min_stock === null ? "Not set" : num(p.min_stock)}</b></div>
          </div>
          {p.description && <p style={{ marginTop: 12, color: "var(--text-2)" }}>{p.description}</p>}
        </div>
        <div style={{ textAlign: "right" }}>
          <small className="dim">Current stock</small>
          <div className="big">{num(p.current_stock)} <span className="dim" style={{ fontSize: 16, fontFamily: "var(--sans)", letterSpacing: 0 }}>{p.uom}</span></div>
          <div style={{ marginTop: 8 }}><StatusBadge stock={p.current_stock} min={p.min_stock} /></div>
        </div>
      </div>
      <div className="actions" style={{ marginBottom: 24 }}>
        {p.archived ? <span className="tag">Archived. Restore it from Products to record stock.</span> : <StockActions id={p.id} admin={admin} storeCanDamage={s.storeCanDamage} size="md" />}
        {admin && !p.archived && <Link className="btn" href={`/products/${p.id}/correct`}>Correct stock</Link>}
        {admin && <Link className="btn" href={`/products/${p.id}/edit`}>Edit product</Link>}
      </div>
      <div className="sec-h"><h2 style={{ font: "inherit" }}>Stock history</h2></div>
      <FilterBar
        placeholder="Search history..."
        count={`${total} movement${total === 1 ? "" : "s"}`}
        fields={[
          { name: "type", label: "Movement type", type: "select", options: (Object.keys(MOVEMENT_LABEL) as (keyof typeof MOVEMENT_LABEL)[]).map((k) => ({ value: k, label: MOVEMENT_LABEL[k] })) },
          { name: "from", label: "From", type: "date" }, { name: "to", label: "To", type: "date" },
        ]}
      />
      {rows.length === 0 ? <Empty title="No movements match"><p>Reset the filters to see all history for this product.</p></Empty> : (
        <>
          <HistoryTable rows={rows} s={s} showProduct={false} />
          <Pager page={page} size={SIZE} total={total} base={base} />
        </>
      )}
    </>
  );
}
