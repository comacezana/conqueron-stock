import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettings, requireUser } from "@/lib/auth";
import { MONTH_RE, monthLabel, monthOf, monthlyReport, reportMonths, shiftMonth } from "@/lib/reports";
import { mailConfigured } from "@/lib/mail";
import { num } from "@/lib/format";
import { Empty, PageHead, StatusBadge } from "@/components/ui";
import SendReportForm from "@/components/SendReportForm";
import { CaretLeft, CaretRight, DownloadSimple } from "@phosphor-icons/react/dist/ssr";

const Z = ({ v, strong }: { v: number; strong?: boolean }) =>
  <td className={`num r${v === 0 && !strong ? " zero" : ""}`} style={strong ? { fontWeight: 650 } : undefined}>{num(v)}</td>;

const Signed = ({ v, strong }: { v: number; strong?: boolean }) =>
  <td className={`num r${v === 0 ? " zero" : v < 0 ? " neg" : " pos"}`} style={strong ? { fontWeight: 650 } : undefined}>{v > 0 ? "+" : v < 0 ? "−" : ""}{num(Math.abs(v))}</td>;

export default async function MonthReportPage({ params }: { params: Promise<{ month: string }> }) {
  const user = await requireUser();
  const { month } = await params;
  if (!MONTH_RE.test(month)) notFound();
  const s = await getSettings();
  const months = await reportMonths(s.timezone);
  if (month > monthOf(new Date(), s.timezone)) notFound();
  const r = await monthlyReport(month, s.timezone);
  const prev = shiftMonth(month, -1), next = shiftMonth(month, 1);
  const hasPrev = months.includes(prev), hasNext = months.includes(next);
  const admin = user.role === "admin";

  return (
    <>
      <p className="crumb"><Link href="/reports" className="link">Monthly reports</Link> / {r.label}</p>
      <PageHead
        title={`Inventory, ${r.label}`}
        desc={r.inProgress ? "Month to date. These figures change until the month closes." : `Closing balances at the end of ${r.label}.`}
      >
        <nav className="actions" aria-label="Change month">
          {hasPrev ? <Link className="btn" href={`/reports/${prev}`} aria-label={monthLabel(prev)}><CaretLeft size={16} /></Link> : <span className="btn" aria-disabled="true"><CaretLeft size={16} /></span>}
          {hasNext ? <Link className="btn" href={`/reports/${next}`} aria-label={monthLabel(next)}><CaretRight size={16} /></Link> : <span className="btn" aria-disabled="true"><CaretRight size={16} /></span>}
        </nav>
        <a className="btn primary" href={`/reports/${month}/pdf`}><DownloadSimple size={16} />Download PDF</a>
      </PageHead>

      <section className="strip" aria-label="Month summary">
        {r.totals.map((t) => (
          <div key={t.uom} className="stat wide">
            <span className="v">{num(t.start)} <span className="arrow">to</span> {num(t.end)}</span>
            <span className="k">{t.uom} at start and end of month</span>
          </div>
        ))}
        <div className="stat"><span className="v">{r.counts.products}</span><span className="k">Products</span></div>
        <div className="stat"><span className="v">{num(r.counts.movements)}</span><span className="k">Movements</span></div>
        <div className={`stat${r.counts.out ? " bad" : ""}`}><span className="v">{r.counts.out}</span><span className="k">Out of stock at end</span></div>
        <div className={`stat${r.counts.low ? " warn" : ""}`}><span className="v">{r.counts.low}</span><span className="k">Low stock at end</span></div>
      </section>

      {admin && (
        <details className="more" style={{ marginBottom: 20 }}>
          <summary>Email this report as PDF</summary>
          <SendReportForm month={month} defaultTo={s.reportRecipients} mailReady={mailConfigured()} />
        </details>
      )}

      {r.rows.length === 0 ? (
        <Empty title={`No stock recorded by the end of ${r.label}`}><p>Reports start from the month of the first stock movement.</p></Empty>
      ) : (
        <>
          <p className={r.counts.mismatched ? "err" : "recon"} role={r.counts.mismatched ? "alert" : undefined}>
            {r.counts.mismatched
              ? `${r.counts.mismatched} product(s) do not reconcile. Check their stock history.`
              : `Every row reconciles: start + opening + stock in + returns - sales - damage, plus or minus corrections, = end.`}
          </p>
          <div className="tablewrap">
            <table className="t stack report">
              <thead>
                <tr>
                  <th>Product</th><th>SKU</th><th>Dimension</th>
                  <th className="r">Start</th><th className="r">Opening</th><th className="r">Stock in</th><th className="r">Returns</th>
                  <th className="r">Sales</th><th className="r">Damage</th><th className="r">Corrections</th><th className="r">End</th><th>Status at end</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="pname"><Link href={`/products/${row.id}`}>{row.name}</Link>{row.archived && <span className="tag" style={{ marginLeft: 8 }}>Archived</span>}</td>
                    <td className="sku">{row.sku}</td>
                    <td className="hide-s">{row.dimension || "-"}</td>
                    <Z v={row.start} /><Z v={row.opening} /><Z v={row.stock_in} /><Z v={row.returned} />
                    <Z v={row.sold} /><Z v={row.damaged} /><Signed v={row.corrected} />
                    <td className="stock">{num(row.end)}<span className="unit"> {row.uom}</span></td>
                    <td><StatusBadge stock={row.end} min={row.min_stock} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {r.totals.map((t) => (
                  <tr key={t.uom}>
                    <td colSpan={3}>Total, {t.products} products ({t.uom})</td>
                    <Z v={t.start} strong /><Z v={t.opening} strong /><Z v={t.stock_in} strong /><Z v={t.returned} strong />
                    <Z v={t.sold} strong /><Z v={t.damaged} strong /><Signed v={t.corrected} strong />
                    <td className="stock">{num(t.end)}</td><td />
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
          <p className="dim" style={{ marginTop: 12 }}>Status uses each product&apos;s current minimum stock level. Quantities only, no prices or amounts.</p>
        </>
      )}
    </>
  );
}
