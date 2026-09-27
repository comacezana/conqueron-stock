import { getSettings } from "./auth";
import { renderReportPdf } from "./pdf";
import { monthlyReport } from "./reports";

/** SMTP settings come only from environment variables, never from the database or the UI. */
export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
export function parseRecipients(raw: string): { ok: string[]; bad: string[] } {
  const all = raw.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const uniq = [...new Set(all.map((x) => x.toLowerCase()))];
  return { ok: uniq.filter((x) => EMAIL.test(x)), bad: uniq.filter((x) => !EMAIL.test(x)) };
}

export function reportFilename(company: string, month: string) {
  return `${company.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "inventory"}-inventory-${month}.pdf`;
}

export async function buildReportPdf(month: string) {
  const s = await getSettings();
  const report = await monthlyReport(month, s.timezone);
  const generatedAt = new Intl.DateTimeFormat("en-GB", {
    timeZone: s.timezone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());
  const pdf = await renderReportPdf(report, { company: s.company, generatedAt });
  return { pdf, report, settings: s, filename: reportFilename(s.company, month) };
}

export async function emailReport(month: string, to: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!mailConfigured()) return { ok: false, error: "Email is not set up on the server. Add SMTP_HOST, SMTP_USER and SMTP_PASS." };
  if (to.length === 0) return { ok: false, error: "Add at least one recipient email address." };
  const { pdf, report, settings, filename } = await buildReportPdf(month);
  const nodemailer = (await import("nodemailer")).default;
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const subject = `${settings.company}: inventory report, ${report.label}${report.inProgress ? " (month to date)" : ""}`;
  const lines = [
    `Inventory report for ${report.label}${report.inProgress ? ", month to date" : ""}.`,
    "",
    ...report.totals.map((t) => `${t.uom}: ${t.start.toLocaleString("en-US")} at start, ${t.end.toLocaleString("en-US")} at end.`),
    `${report.counts.products} products, ${report.counts.movements.toLocaleString("en-US")} stock movements.`,
    `${report.counts.out} out of stock and ${report.counts.low} low stock at the end of the period.`,
    "",
    "The full report is attached as a PDF.",
  ];
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: lines.join("\n"),
      attachments: [{ filename, content: Buffer.from(pdf), contentType: "application/pdf" }],
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `The email was not sent. The mail server said: ${msg.slice(0, 200)}` };
  }
}
