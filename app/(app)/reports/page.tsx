import Link from "next/link";
import { getSettings, requireUser } from "@/lib/auth";
import { monthlyReport, reportMonths } from "@/lib/reports";
import { num } from "@/lib/format";
import { PageHead } from "@/components/ui";
import { ArrowRight, DownloadSimple } from "@phosphor-icons/react/dist/ssr";

export default async function ReportsPage() {
  await requireUser();
  const s = await getSettings();
  const months = (await reportMonths(s.timezone)).slice(0, 24);
  const reports = await Promise.all(months.map((m) => monthlyReport(m, s.timezone)));

  return (
    <>
      <PageHead title="Monthly reports" desc="End-of-month stock for every product, rebuilt from the stock history. A new report appears automatically when each month starts." />
      <ol className="months">
        {reports.map((r) => (
          <li key={r.month}>
            <Link href={`/reports/${r.month}`} className="month-main">
              <span className="month-name">{r.label}</span>
              <span className="dim">{r.inProgress ? "In progress, month to date" : "Closed"}</span>
            </Link>
            <div className="month-figs">
              {r.totals.map((t) => (
                <span key={t.uom}><b className="num">{num(t.end)}</b> {t.uom} at end</span>
              ))}
              <span><b className="num">{num(r.counts.movements)}</b> movements</span>
              {r.counts.out > 0 && <span className="neg"><b className="num">{r.counts.out}</b> out of stock</span>}
              {r.counts.low > 0 && <span className="warn"><b className="num">{r.counts.low}</b> low</span>}
            </div>
            <div className="actions month-act">
              <a className="btn sm" href={`/reports/${r.month}/pdf`}><DownloadSimple size={15} />PDF</a>
              <Link className="btn sm" href={`/reports/${r.month}`} aria-label={`Open ${r.label}`}><ArrowRight size={15} /></Link>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
