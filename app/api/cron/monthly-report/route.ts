import { timingSafeEqual } from "node:crypto";
import { getSettings } from "@/lib/auth";
import { emailReport, mailConfigured, parseRecipients } from "@/lib/mail";
import { monthOf, shiftMonth } from "@/lib/reports";

/**
 * Emails last month's closed report to the recipients saved in Settings.
 * Meant for a scheduler (vercel.json runs it on the 1st of each month). Disabled unless
 * CRON_SECRET is set; callers must send `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want)))
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const s = await getSettings();
  const month = shiftMonth(monthOf(new Date(), s.timezone), -1);
  const to = parseRecipients(s.reportRecipients).ok;
  if (!mailConfigured() || to.length === 0)
    return Response.json({ ok: true, skipped: true, month, reason: !mailConfigured() ? "SMTP not configured" : "no recipients in Settings" });

  const r = await emailReport(month, to);
  return Response.json(r.ok ? { ok: true, month, sentTo: to.length } : { ok: false, month, error: r.error }, { status: r.ok ? 200 : 502 });
}
