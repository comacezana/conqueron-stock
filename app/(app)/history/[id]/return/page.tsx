import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSettings, requireUser } from "@/lib/auth";
import { getMovement, getProduct } from "@/lib/queries";
import { money, num, when } from "@/lib/format";
import { movementNo } from "@/lib/types";
import ReturnForm from "@/components/ReturnForm";
import { PageHead } from "@/components/ui";

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const m = await getMovement(Number((await params).id));
  if (!m || m.type !== "sale") notFound();
  if (m.returned >= m.corrected_quantity || m.archived) redirect(`/history/${m.id}`);
  const p = await getProduct(m.product_id);
  const s = await getSettings();
  return (
    <>
      <p className="crumb"><Link href={`/history/${m.id}`} className="link">Sale {movementNo(m.id)}</Link> / Return items</p>
      <PageHead title="Return items" desc="Returns are always linked to the sale they came from." />
      <div className="kv" style={{ marginBottom: 24, marginTop: 0 }}>
        <div><small>Product</small><b>{m.name}</b></div>
        <div><small>SKU</small><b className="mono">{m.sku}</b></div>
        <div><small>Dimension</small><b>{m.dimension}</b></div>
        <div><small>Sale date</small><b className="num">{when(m.created_at, s.timezone)}</b></div>
        {m.amount !== null && <div><small>Amount sold</small><b className="num">{money(m.amount, s.currency)}</b></div>}
        <div><small>Sold by</small><b>{m.user_name}</b></div>
        <div><small>Sold</small><b className="num">{num(m.corrected_quantity)} {m.uom}</b>{m.corrected_quantity !== m.quantity && <small>corrected from {num(m.quantity)}</small>}</div>
      </div>
      <ReturnForm saleId={m.id} uom={m.uom} sold={m.corrected_quantity} returned={m.returned} stock={p?.current_stock ?? 0} currency={s.currency} />
    </>
  );
}
