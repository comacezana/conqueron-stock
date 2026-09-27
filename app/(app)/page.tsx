import Link from "next/link";
import { getSettings, requireUser } from "@/lib/auth";
import { dashboardStats, first, listMovements, listProducts, type SP } from "@/lib/queries";
import { change, num, when } from "@/lib/format";
import { PageHead, TypeTag } from "@/components/ui";
import { MagnifyingGlass, Minus, Plus } from "@phosphor-icons/react/dist/ssr";

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const s = await getSettings();
  const [st, recent, out, low] = await Promise.all([
    dashboardStats(),
    listMovements({ limit: 12 }, s.timezone),
    listProducts({ status: "out" }),
    listProducts({ status: "low" }),
  ]);
  const attention = [
    ...out.slice(0, 5).map((p) => ({ p, kind: "out" as const })),
    ...low.slice(0, 5).map((p) => ({ p, kind: "low" as const })),
  ].slice(0, 6);

  return (
    <>
      <PageHead title="Dashboard" desc={`${s.company} stock at a glance.`} />
      {first(sp.denied) && <div className="err" style={{ marginBottom: 16 }} role="alert">That area is available to Admin only.</div>}

      <form action="/inventory" role="search" className="dash-search">
        <label className="sr" htmlFor="dq">Find a product</label>
        <MagnifyingGlass size={20} />
        <input id="dq" name="q" className="input" placeholder="Find a product by name, SKU or dimension..." autoComplete="off" />
        <button className="btn primary">Search</button>
        <Link href="/stock/in" className="btn"><Plus size={16} weight="bold" />Stock In</Link>
        <Link href="/stock/sale" className="btn"><Minus size={16} weight="bold" />Sale</Link>
      </form>

      <div className="strip" aria-label="Stock summary">
        <Link href="/inventory?status=out" className={`stat${st.out ? " bad" : ""}`}><span className="v">{st.out}</span><span className="k">Out of stock</span></Link>
        <Link href="/inventory?status=low" className={`stat${st.low ? " warn" : ""}`}><span className="v">{st.low}</span><span className="k">Low stock</span></Link>
        <Link href="/inventory" className="stat"><span className="v">{st.total}</span><span className="k">Products</span></Link>
        {st.byUom.map((u) => (
          <Link key={u.uom} href={`/inventory?uom=${encodeURIComponent(u.uom)}`} className="stat">
            <span className="v">{num(u.stock)}</span><span className="k">Total {u.uom} in stock</span>
          </Link>
        ))}
      </div>

      <div className="dash2">
        <section aria-label="Recent stock movements">
          <div className="sec-h"><h2 style={{ font: "inherit" }}>Recent stock movements</h2><Link className="link" href="/history">All history</Link></div>
          <ol className="feed">
            {recent.rows.map((m, i) => (
              <li key={m.id} style={{ ["--i" as string]: i }}>
                <div>
                  <Link href={`/history/${m.id}`} className="mono" style={{ fontWeight: 600 }}>{m.sku}</Link>{" "}
                  <TypeTag t={m.type} />
                  <div className="sub">{m.name} · {m.user_name}</div>
                </div>
                <div>
                  <div className={`q ${m.new_stock < m.previous_stock ? "neg" : "pos"}`}>{change(m.previous_stock, m.new_stock)} {m.uom}</div>
                  <div className="sub" style={{ textAlign: "right" }}>{when(m.created_at, s.timezone)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside aria-label="Needs attention">
          <div className="sec-h"><h2 style={{ font: "inherit" }}>Needs attention</h2></div>
          {attention.length > 0 ? (
            <ul className="feed">
              {attention.map(({ p, kind }) => (
                <li key={p.id}>
                  <div>
                    <Link href={`/products/${p.id}`} style={{ fontWeight: 550 }}>{p.name}</Link>
                    <div className="sub"><span className="mono">{p.sku}</span> · {p.dimension}</div>
                  </div>
                  <div className={`q ${kind === "out" ? "neg" : ""}`} style={kind === "low" ? { color: "var(--warn-t)" } : undefined}>
                    {num(p.current_stock)} {p.uom}
                    <div className="sub" style={{ fontFamily: "var(--sans)", fontWeight: 600 }}>{kind === "out" ? "OUT OF STOCK" : "LOW STOCK"}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dim" style={{ paddingTop: 8 }}>
              {st.unset > 0
                ? `No product is low or out of stock. Alerts only work for products with a minimum stock level, and ${st.unset} have none yet.`
                : "Nothing is low or out of stock."}
            </p>
          )}
          {st.unset > 0 && (
            <p style={{ marginTop: 14 }}>
              <Link href="/inventory?status=unset" className="link">{st.unset} products have no minimum stock set</Link>
              {user.role !== "admin" && <span className="dim"> · Admin sets these</span>}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
