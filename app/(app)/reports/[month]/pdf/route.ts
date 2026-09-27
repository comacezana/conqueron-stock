import { getUser } from "@/lib/auth";
import { buildReportPdf } from "@/lib/mail";
import { MONTH_RE } from "@/lib/reports";

export async function GET(_req: Request, { params }: { params: Promise<{ month: string }> }) {
  if (!(await getUser())) return new Response("Sign in to download reports.", { status: 401 });
  const { month } = await params;
  if (!MONTH_RE.test(month)) return new Response("Unknown month.", { status: 404 });
  const { pdf, filename } = await buildReportPdf(month);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
