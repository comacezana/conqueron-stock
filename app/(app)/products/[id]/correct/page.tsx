import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSettings, requireUser } from "@/lib/auth";
import { getProduct, listMovements } from "@/lib/queries";
import { num, when } from "@/lib/format";
import { CORRECTABLE, MOVEMENT_LABEL, movementNo } from "@/lib/types";
import CorrectionForm from "@/components/CorrectionForm";
import { PageHead, TypeTag } from "@/components/ui";

export default async function CorrectStockPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const p = await getProduct(Number((await params).id));
  if (!p) notFound();
  if (p.archived) redirect(`/products/${p.id}`);
  const s = await getSettings();
  const recent = (await listMovements({ productId: p.id, limit: 40 }, s.timezone)).rows.filter((m) => CORRECTABLE.includes(m.type)).slice(0, 8);

  return (
    <>
      <p className="crumb"><Link href={`/products/${p.id}`} className="link">{p.sku}</Link> / Correct stock</p>
      <PageHead title="Correct stock" desc={`${p.name}, ${p.dimension}. Admin only.`} />

      {recent.length > 0 && (
        <details className="more" style={{ marginBottom: 24 }} open>
          <summary>Was one entry typed wrong? Fix that entry instead</summary>
          <p className="dim" style={{ marginBottom: 10 }}>Fixing the entry itself links the correction to the mistake, so the history shows exactly what was wrong.</p>
          <ul className="feed" style={{ marginBottom: 14 }}>
            {recent.map((m) => (
              <li key={m.id}>
                <div>
                  <span className="mono">{movementNo(m.id)}</span> <TypeTag t={m.type} />
                  <div className="sub">{when(m.created_at, s.timezone)} &middot; {m.user_name}{m.corrected_quantity !== m.quantity ? ` · corrected to ${num(m.corrected_quantity)}` : ""}</div>
                </div>
                <div className="actions">
                  <span className="num" style={{ fontWeight: 650 }}>{num(m.quantity)} {m.uom}</span>
                  <Link href={`/history/${m.id}/correct`} className="btn sm">Correct this {MOVEMENT_LABEL[m.type].toLowerCase()}</Link>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <CorrectionForm mode="count" productId={p.id} uom={p.uom} stock={p.current_stock} cancelHref={`/products/${p.id}`} />
    </>
  );
}
