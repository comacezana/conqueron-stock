import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettings, requireUser } from "@/lib/auth";
import { first, getMovement, listCorrectionsOf, listReturnsOf, type SP } from "@/lib/queries";
import { change, money, num, when } from "@/lib/format";
import { CORRECTABLE, MOVEMENT_LABEL, movementNo } from "@/lib/types";
import { PageHead, TypeTag } from "@/components/ui";
import { ArrowUUpLeft, PencilSimpleLine } from "@phosphor-icons/react/dist/ssr";

export default async function MovementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser();
  const m = await getMovement(Number((await params).id));
  if (!m) notFound();
  const sp = await searchParams;
  const s = await getSettings();
  const admin = user.role === "admin";
  const isSale = m.type === "sale";
  const correctable = CORRECTABLE.includes(m.type);
  const [returns, corrections] = await Promise.all([isSale ? listReturnsOf(m.id) : [], correctable ? listCorrectionsOf(m.id) : []]);
  const source = m.source_movement_id ? await getMovement(m.source_movement_id) : null;
  const corrected = m.corrected_quantity !== m.quantity;
  const remaining = m.corrected_quantity - m.returned;
  const justReturned = first(sp.returned);

  return (
    <>
      <p className="crumb"><Link href="/history" className="link">Stock History</Link> / {movementNo(m.id)}</p>
      <PageHead title={`${MOVEMENT_LABEL[m.type]} ${movementNo(m.id)}`}>
        {correctable && admin && !m.archived && (
          <Link href={`/history/${m.id}/correct`} className="btn"><PencilSimpleLine size={16} />Correct this entry</Link>
        )}
        {isSale && admin && remaining > 0 && !m.archived && (
          <Link href={`/history/${m.id}/return`} className="btn primary"><ArrowUUpLeft size={16} />Return items</Link>
        )}
      </PageHead>
      {justReturned && <div className="okmsg" role="status" style={{ marginBottom: 16 }}>Return saved. {num(Number(justReturned))} {m.uom} went back into stock.</div>}
      {first(sp.corrected) && <div className="okmsg" role="status" style={{ marginBottom: 16 }}>Correction saved. This {MOVEMENT_LABEL[m.type].toLowerCase()} now counts as {num(m.corrected_quantity)} {m.uom}.</div>}

      <div className="ph" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 620 }}>{m.name}</h2>
          <div className="kv">
            <div><small>SKU</small><b className="mono">{m.sku}</b></div>
            <div><small>Dimension</small><b>{m.dimension || "-"}</b></div>
            <div><small>Date / time</small><b className="num">{when(m.created_at, s.timezone)}</b></div>
            <div><small>{isSale ? "Sold by" : "Recorded by"}</small><b>{m.user_name} ({m.user_role})</b></div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <small className="dim">{corrected ? "As recorded" : isSale ? "Originally sold" : "Quantity"}</small>
          <div className="big" style={{ fontSize: 36 }}>{change(m.previous_stock, m.new_stock)} <span className="dim" style={{ fontSize: 16, fontFamily: "var(--sans)" }}>{m.uom}</span></div>
          {corrected && <div className="warn" style={{ fontWeight: 600 }}>Corrected to {num(m.corrected_quantity)} {m.uom}</div>}
          <div className="dim num">Stock {num(m.previous_stock)} &rarr; {num(m.new_stock)}</div>
        </div>
      </div>

      <div className="kv" style={{ marginBottom: 28 }}>
        {m.amount !== null && <div><small>{isSale ? "Amount sold" : "Return amount"}</small><b className="num">{money(m.amount, s.currency)}</b></div>}
        {m.reason && <div><small>Reason</small><b>{m.reason}</b></div>}
        {isSale && <>
          <div><small>Already returned</small><b className="num">{num(m.returned)} {m.uom}</b></div>
          <div><small>Remaining returnable</small><b className="num">{num(remaining)} {m.uom}</b></div>
          <div><small>Sale status</small><b>{m.returned === 0 ? "Sold" : remaining === 0 ? "FULLY RETURNED" : "PARTLY RETURNED"}</b></div>
        </>}
      </div>

      {source && (
        <section style={{ marginBottom: 28 }}>
          <div className="sec-h"><h2 style={{ font: "inherit" }}>{m.type === "return" ? "Source sale" : "Corrects entry"}</h2></div>
          <Link href={`/history/${source.id}`} className="link">
            {movementNo(source.id)} &middot; {when(source.created_at, s.timezone)} &middot; {MOVEMENT_LABEL[source.type]} &middot; recorded {num(source.quantity)} {source.uom}
          </Link>
        </section>
      )}

      {corrections.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div className="sec-h"><h2 style={{ font: "inherit" }}>Corrections</h2></div>
          <ul className="feed">
            {corrections.map((c) => (
              <li key={c.id}>
                <div>
                  <Link href={`/history/${c.id}`} className="mono link">{movementNo(c.id)}</Link> <TypeTag t="adjustment" />
                  <div className="sub">{c.reason} &middot; by {c.user_name} &middot; {when(c.created_at, s.timezone)}</div>
                </div>
                <div className={`q ${c.new_stock < c.previous_stock ? "neg" : "pos"}`}>{change(c.previous_stock, c.new_stock)} {c.uom}</div>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 12 }}>Recorded <span className="num">{num(m.quantity)}</span>, now counts as <b className="num">{num(m.corrected_quantity)} {m.uom}</b>. The original entry is unchanged.</p>
        </section>
      )}

      {isSale && (
        <section>
          <div className="sec-h"><h2 style={{ font: "inherit" }}>Related returns</h2></div>
          {returns.length === 0 ? <p className="dim">No returns against this sale.{!admin && " Only Admin can process returns."}</p> : (
            <>
              <ul className="feed">
                {returns.map((r) => (
                  <li key={r.id}>
                    <div>
                      <Link href={`/history/${r.id}`} className="mono link">RETURN {movementNo(r.id)}</Link> <TypeTag t="return" />
                      <div className="sub">{r.reason} &middot; processed by {r.user_name} &middot; {when(r.created_at, s.timezone)}</div>
                    </div>
                    <div className="q pos">+{num(r.quantity)} {r.uom}{r.amount !== null && <div className="sub" style={{ fontWeight: 400 }}>{money(r.amount, s.currency)}</div>}</div>
                  </li>
                ))}
              </ul>
              <p style={{ marginTop: 12 }}><b>Total returned:</b> <span className="num">{num(m.returned)} {m.uom}</span> &middot; <b>Remaining returnable:</b> <span className="num">{num(remaining)} {m.uom}</span></p>
            </>
          )}
        </section>
      )}
    </>
  );
}
