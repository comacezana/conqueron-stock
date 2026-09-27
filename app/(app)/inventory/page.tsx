import { getSettings, requireUser } from "@/lib/auth";
import { filterOptions, listProducts, productFiltersFrom, type SP } from "@/lib/queries";
import { MOVEMENT_LABEL } from "@/lib/types";
import FilterBar, { type FilterField } from "@/components/FilterBar";
import { Empty, InventoryTable, PageHead, StockActions } from "@/components/ui";
import { Plus, Minus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const s = await getSettings();
  const f = productFiltersFrom(sp);
  const [rows, opt] = await Promise.all([listProducts(f, s.timezone), filterOptions()]);

  const fields: FilterField[] = [
    { name: "category", label: "Category", type: "select", options: [...opt.categories.map((c) => ({ value: String(c.id), label: c.name })), { value: "none", label: "No category" }] },
    { name: "status", label: "Stock status", type: "select", options: [{ value: "in", label: "In Stock" }, { value: "low", label: "Low Stock" }, { value: "out", label: "Out of Stock" }, { value: "unset", label: "Minimum not set" }] },
    { name: "dimension", label: "Dimension", type: "select", options: opt.dimensions.map((d) => ({ value: d, label: d })) },
    { name: "uom", label: "UOM", type: "select", options: opt.uoms.map((u) => ({ value: u, label: u })) },
    { name: "type", label: "Had movement", type: "select", more: true, options: (Object.keys(MOVEMENT_LABEL) as (keyof typeof MOVEMENT_LABEL)[]).map((k) => ({ value: k, label: MOVEMENT_LABEL[k] })) },
    { name: "from", label: "Movement from", type: "date", more: true },
    { name: "to", label: "Movement to", type: "date", more: true },
  ];
  const title = f.status === "low" ? "Low Stock" : f.status === "out" ? "Out of Stock" : "Inventory";

  return (
    <>
      <PageHead title={title} desc="Find a product, then record stock in or out. Balances update immediately.">
        <Link href="/stock/in" className="btn primary"><Plus size={16} weight="bold" />Stock In</Link>
        <Link href="/stock/sale" className="btn"><Minus size={16} weight="bold" />Sale / Stock Out</Link>
      </PageHead>
      <FilterBar fields={fields} helper="Searches product name, SKU, dimension and category. Try 110 to find every 110mm size." count={`${rows.length} product${rows.length === 1 ? "" : "s"}`} />
      {rows.length === 0 ? (
        <Empty title={f.search ? `No products match "${f.search}"` : "No products match these filters"}>
          <p>Clear the search or reset the filters to see the full list.</p>
        </Empty>
      ) : (
        <InventoryTable rows={rows} admin={user.role === "admin"} storeCanDamage={s.storeCanDamage} />
      )}
    </>
  );
}
