import Link from "next/link";
import { getSettings, requireUser } from "@/lib/auth";
import { first, getProduct, listMovements, type SP } from "@/lib/queries";
import { money, num, when } from "@/lib/format";
import { movementNo } from "@/lib/types";
import FilterBar from "@/components/FilterBar";
import { Empty, PageHead } from "@/components/ui";

export default async function FindSalePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser("admin");
  const sp = await searchParams;
  const s = await getSettings();
  const pid = Number(first(sp.product)) || undefined;
  const [prod, { rows, total }] = await Promise.all([
    pid ? getProduct(pid) : null,
    listMovements({ search: first(sp.q), from: first(sp.from), to: first(sp.to), productId: pid, type: "sale", returnable: true, limit: 50 }, s.timezone),
  ]);
  return (
    <>
      <PageHead title="Return" desc="Returns must come from a sale. Find the original sale below, open it, then choose Return items." />
      {prod && <p className="dim" style={{ marginBottom: 12 }}>Showing sales of <b>{prod.name}</b> ({prod.sku}). <Link href="/stock/return" className="link">Show all products</Link></p>}
      <FilterBar
        placeholder="Search sales by product, SKU or dimension..."
        count={`${total} sale${total === 1 ? "" : "s"} with items left to return`}
        fields={[{ name: "from", label: "Sold from", type: "date" }, { name: "to", label: "Sold to", type: "date" }]}
      />
      {rows.length === 0 ? (
        <Empty title="No returnable sales found"><p>Only sales that still have unreturned quantity appear here.</p></Empty>
      ) : (
        <div className="tablewrap">
          <table className="t stack">
            <thead><tr><th>Sale</th><th>Date / time</th><th>Product</th><th className="r">Sold</th><th className="r">Returned</th><th className="r">Returnable</th><th>Amount sold</th><th>Sold by</th><th><span className="sr">Action</span></th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="num"><Link href={`/history/${m.id}`} className="link">{movementNo(m.id)}</Link></td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>{when(m.created_at, s.timezone)}</td>
                  <td className="pname">{m.name}<div className="dim"><span className="mono">{m.sku}</span> · {m.dimension}</div></td>
                  <td className="num r">{num(m.corrected_quantity)} {m.uom}</td>
                  <td className="hide-s num r dim">{num(m.returned)}</td>
                  <td className="num r" style={{ fontWeight: 650 }}>{num(m.corrected_quantity - m.returned)}</td>
                  <td className="hide-s num">{m.amount === null ? "-" : money(m.amount, s.currency)}</td>
                  <td className="hide-s">{m.user_name}</td>
                  <td className="actcell"><div className="rowact"><Link href={`/history/${m.id}`} className="btn sm">Open sale</Link></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
