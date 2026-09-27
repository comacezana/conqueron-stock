import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSettings, requireUser } from "@/lib/auth";
import { getMovement, getProduct } from "@/lib/queries";
import { num, when } from "@/lib/format";
import { CORRECTABLE, MOVEMENT_LABEL, movementNo } from "@/lib/types";
import CorrectionForm from "@/components/CorrectionForm";
import { PageHead } from "@/components/ui";

export default async function CorrectEntryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const m = await getMovement(Number((await params).id));
  if (!m) notFound();
  if (!CORRECTABLE.includes(m.type) || m.archived) redirect(`/history/${m.id}`);
  const p = await getProduct(m.product_id);
  const s = await getSettings();
  const label = MOVEMENT_LABEL[m.type].toLowerCase();

  return (
    <>
      <p className="crumb"><Link href={`/history/${m.id}`} className="link">{MOVEMENT_LABEL[m.type]} {movementNo(m.id)}</Link> / Correct</p>
      <PageHead title={`Correct ${label} ${movementNo(m.id)}`} desc="Enter what the entry should have been. The stock changes by the difference." />
      <div className="kv" style={{ marginBottom: 24, marginTop: 0 }}>
        <div><small>Product</small><b>{m.name}</b></div>
        <div><small>SKU</small><b className="mono">{m.sku}</b></div>
        <div><small>Recorded</small><b className="num">{num(m.quantity)} {m.uom}</b></div>
        <div><small>Date / time</small><b className="num">{when(m.created_at, s.timezone)}</b></div>
        <div><small>Recorded by</small><b>{m.user_name}</b></div>
      </div>
      <CorrectionForm
        mode="entry" sourceId={m.id} entryLabel={label} uom={m.uom} stock={p?.current_stock ?? 0}
        recorded={m.quantity} effective={m.corrected_quantity} adds={m.type === "opening" || m.type === "in"}
        floor={m.type === "sale" ? m.returned : 0} cancelHref={`/history/${m.id}`}
      />
    </>
  );
}
