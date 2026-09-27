import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { MonthlyReport } from "./reports";

const W = 842, H = 595, M = 36;              // A4 landscape, points
const INK = rgb(0.094, 0.094, 0.106);
const MUTED = rgb(0.4, 0.4, 0.43);
const ZEBRA = rgb(0.957, 0.957, 0.961);
const RULE = rgb(0.85, 0.85, 0.87);
const STATUS_COLOR = { out: rgb(0.6, 0.106, 0.106), low: rgb(0.52, 0.3, 0.05), in: INK, unset: MUTED } as const;
const STATUS_TEXT = { in: "In stock", low: "Low stock", out: "Out of stock", unset: "No minimum" } as const;

type Col = { key: string; label: string; w: number; align?: "right" };
const COLS: Col[] = [
  { key: "n", label: "#", w: 14 },
  { key: "name", label: "Product", w: 186 },
  { key: "sku", label: "SKU", w: 86 },
  { key: "dimension", label: "Dimension", w: 62 },
  { key: "uom", label: "UOM", w: 26 },
  { key: "start", label: "Start", w: 44, align: "right" },
  { key: "opening", label: "Opening", w: 44, align: "right" },
  { key: "stock_in", label: "Stock in", w: 42, align: "right" },
  { key: "returned", label: "Returns", w: 40, align: "right" },
  { key: "sold", label: "Sales", w: 42, align: "right" },
  { key: "damaged", label: "Damage", w: 40, align: "right" },
  { key: "corrected", label: "Correct.", w: 42, align: "right" },
  { key: "end", label: "End", w: 46, align: "right" },
  { key: "status", label: "Status at end", w: 56 },
];

const n = (v: number) => new Intl.NumberFormat("en-US").format(v);

/** Standard PDF fonts only cover WinAnsi; swap anything else for "?" rather than throwing. */
function safeText(font: PDFFont) {
  const ok = new Map<string, boolean>();
  return (s: string) =>
    [...s.replace(/−/g, "-")].map((ch) => {
      if (!ok.has(ch)) { try { font.widthOfTextAtSize(ch, 8); ok.set(ch, true); } catch { ok.set(ch, false); } }
      return ok.get(ch) ? ch : "?";
    }).join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number, maxLines = 2): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width) cur = next;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(`${last}...`, size) > width) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}...`;
    return kept;
  }
  return lines;
}

export async function renderReportPdf(r: MonthlyReport, opts: { company: string; generatedAt: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${opts.company} inventory report ${r.label}`);
  doc.setAuthor(opts.company);
  doc.setCreator("Conqueron Stock Ledger");
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const s = safeText(reg), sb = safeText(bold);

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const SIZE = 7.5, LINE = 9.5, PAD = 4;

  const text = (p: PDFPage, t: string, x: number, yy: number, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; right?: number } = {}) => {
    const font = o.font ?? reg, size = o.size ?? SIZE;
    const str = (font === bold ? sb : s)(t);
    const dx = o.right !== undefined ? o.right - font.widthOfTextAtSize(str, size) : 0;
    p.drawText(str, { x: x + dx, y: yy, size, font, color: o.color ?? INK });
  };

  const tableHeader = () => {
    let x = M;
    page.drawRectangle({ x: M, y: y - 14, width: W - 2 * M, height: 16, color: ZEBRA });
    for (const c of COLS) {
      text(page, c.label, x + 2, y - 9, { font: bold, size: 7, color: MUTED, right: c.align ? c.w - 4 : undefined });
      x += c.w;
    }
    y -= 20;
  };

  const newPage = (first: boolean) => {
    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - M;
    if (first) {
      text(page, opts.company, M, y - 10, { font: bold, size: 11, color: MUTED });
      text(page, `Inventory report, ${r.label}`, M, y - 32, { font: bold, size: 20 });
      text(page, r.inProgress ? `Month to date. Figures are provisional until the month closes.` : `Closing balances at the end of ${r.label}.`, M, y - 48, { size: 9, color: MUTED });
      text(page, `Generated ${opts.generatedAt} (${r.timezone})`, W - M, y - 10, { size: 8, color: MUTED, right: 0 });

      // summary line
      const facts = [
        [`${r.counts.products}`, "products"],
        [`${n(r.counts.movements)}`, "movements this month"],
        [`${r.counts.out}`, "out of stock at end"],
        [`${r.counts.low}`, "low stock at end"],
      ];
      let x = M;
      y -= 78;
      for (const [v, k] of facts) {
        text(page, v, x, y, { font: bold, size: 16 });
        text(page, k, x, y - 12, { size: 8, color: MUTED });
        x += 150;
      }
      y -= 30;
      for (const t of r.totals) {
        text(page, `${t.uom}: start ${n(t.start)}  +opening ${n(t.opening)}  +in ${n(t.stock_in)}  +returns ${n(t.returned)}  -sales ${n(t.sold)}  -damage ${n(t.damaged)}  ${t.corrected >= 0 ? "+" : "-"}corrections ${n(Math.abs(t.corrected))}  =  end ${n(t.end)} ${t.uom}`, M, y, { size: 8.5 });
        y -= 13;
      }
      y -= 8;
    }
    tableHeader();
  };

  newPage(true);

  r.rows.forEach((row, i) => {
    const nameLines = wrap(s(row.name), reg, SIZE, COLS[1].w - 6);
    const h = nameLines.length * LINE + PAD * 2 - 2;
    if (y - h < M + 24) newPage(false);
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - h + 2, width: W - 2 * M, height: h, color: ZEBRA });

    const top = y - PAD - 5;
    let x = M;
    for (const c of COLS) {
      if (c.key === "name") {
        nameLines.forEach((l, li) => text(page, l, x + 2, top - li * LINE));
      } else if (c.key === "status") {
        text(page, STATUS_TEXT[row.status], x + 2, top, { font: row.status === "in" ? reg : bold, color: STATUS_COLOR[row.status] });
      } else {
        const v = c.key === "n" ? String(i + 1)
          : c.key === "sku" ? row.sku
          : c.key === "dimension" ? row.dimension || "-"
          : c.key === "uom" ? row.uom
          : c.key === "corrected" ? (row.corrected > 0 ? `+${n(row.corrected)}` : row.corrected < 0 ? `-${n(-row.corrected)}` : "0")
          : n(row[c.key as "start"]);
        const muted = c.align && v === "0" && c.key !== "end";
        text(page, v, x + 2, top, { font: c.key === "end" ? bold : reg, color: muted || c.key === "n" ? MUTED : INK, right: c.align ? c.w - 4 : undefined });
      }
      x += c.w;
    }
    y -= h;
  });

  // closing notes
  if (y < M + 60) newPage(false);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: RULE });
  y -= 14;
  const rec = r.counts.mismatched === 0
    ? `All ${r.counts.products} rows reconcile: Start + Opening + Stock in + Returns - Sales - Damage +/- Corrections = End.`
    : `${r.counts.mismatched} row(s) do not reconcile. Check the stock history for these products.`;
  text(page, rec, M, y, { size: 8, font: r.counts.mismatched ? bold : reg, color: r.counts.mismatched ? STATUS_COLOR.out : MUTED });
  y -= 12;
  text(page, "Status uses each product's current minimum stock level. Quantities only: this report contains no prices or amounts.", M, y, { size: 8, color: MUTED });

  pages.forEach((p, i) => {
    text(p, `${opts.company}  |  Inventory report, ${r.label}`, M, M - 14, { size: 7, color: MUTED });
    text(p, `Page ${i + 1} of ${pages.length}`, W - M, M - 14, { size: 7, color: MUTED, right: 0 });
  });

  return doc.save();
}
