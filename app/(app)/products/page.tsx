import Link from "next/link";
import { getSettings, requireUser } from "@/lib/auth";
import { filterOptions, listProducts, productFiltersFrom, type SP } from "@/lib/queries";
import { setArchived } from "@/app/actions";
import FilterBar, { type FilterField } from "@/components/FilterBar";
import { Empty, PageHead, StatusBadge } from "@/components/ui";
import { num } from "@/lib/format";
import { Plus } from "@phosphor-icons/react/dist/ssr";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const admin = user.role === "admin";
  const sp = await searchParams;
  await getSettings();
  const f = { ...productFiltersFrom(sp), includeArchived: admin };
  const [rows, opt] = await Promise.all([listProducts(f), filterOptions()]);
  const fields: FilterField[] = [
    { name: "category", label: "Category", type: "select", options: [...opt.categories.map((c) => ({ value: String(c.id), label: c.name })), { value: "none", label: "No category" }] },
    { name: "dimension", label: "Dimension", type: "select", options: opt.dimensions.map((d) => ({ value: d, label: d })) },
    { name: "uom", label: "UOM", type: "select", options: opt.uoms.map((u) => ({ value: u, label: u })) },
  ];
  return (
    <>
      <PageHead title="Products" desc="Product records as supplied. Descriptions and article numbers are shown exactly as recorded.">
        {admin && <Link href="/products/new" className="btn primary"><Plus size={16} weight="bold" />Add product</Link>}
      </PageHead>
      <FilterBar fields={fields} placeholder="Search products..." count={`${rows.length} products`} />
      {rows.length === 0 ? (
        <Empty title="No products found"><p>Clear the search or reset the filters.</p></Empty>
      ) : (
        <div className="tablewrap">
          <table className="t stack">
            <thead>
              <tr><th>Product</th><th>SKU</th><th>Category</th><th>Dimension</th><th>UOM</th><th className="r">Stock</th><th>Status</th>{admin && <th><span className="sr">Actions</span></th>}</tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} style={p.archived ? { opacity: 0.65 } : undefined}>
                  <td className="pname"><Link href={`/products/${p.id}`} style={{ fontWeight: 550 }}>{p.name}</Link>{p.archived && <span className="tag" style={{ marginLeft: 8 }}>Archived</span>}</td>
                  <td className="sku">{p.sku}</td>
                  <td className="hide-s dim">{p.category ?? "-"}</td>
                  <td>{p.dimension || "-"}</td>
                  <td className="hide-s">{p.uom}</td>
                  <td className="stock">{num(p.current_stock)}</td>
                  <td><StatusBadge stock={p.current_stock} min={p.min_stock} /></td>
                  {admin && (
                    <td className="actcell">
                      <div className="rowact">
                        <Link href={`/products/${p.id}/edit`} className="btn sm">Edit</Link>
                        <form action={setArchived.bind(null, p.id, !p.archived)}>
                          <button className={`btn sm${p.archived ? "" : " danger"}`}>{p.archived ? "Restore" : "Archive"}</button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
