import { getSettings, requireUser } from "@/lib/auth";
import { filterOptions, first, listMovements, type SP } from "@/lib/queries";
import { q } from "@/lib/db";
import { MOVEMENT_LABEL } from "@/lib/types";
import FilterBar from "@/components/FilterBar";
import { Empty, HistoryTable, Pager, PageHead } from "@/components/ui";

const SIZE = 50;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const s = await getSettings();
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const [{ rows, total }, opt, users] = await Promise.all([
    listMovements({ search: first(sp.q), type: first(sp.type), from: first(sp.from), to: first(sp.to), category: first(sp.category), user: first(sp.user), limit: SIZE, offset: (page - 1) * SIZE }, s.timezone),
    filterOptions(),
    q<{ id: number; name: string }>("SELECT id,name FROM users ORDER BY name"),
  ]);
  const base = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));
  return (
    <>
      <PageHead title="Stock History" desc={`Every movement, newest first. Times shown in ${s.timezone}. Records are never edited or deleted.`} />
      <FilterBar
        placeholder="Search by product, SKU, dimension or reason..."
        count={`${total.toLocaleString("en-US")} movement${total === 1 ? "" : "s"}`}
        fields={[
          { name: "type", label: "Movement type", type: "select", options: (Object.keys(MOVEMENT_LABEL) as (keyof typeof MOVEMENT_LABEL)[]).map((k) => ({ value: k, label: MOVEMENT_LABEL[k] })) },
          { name: "category", label: "Category", type: "select", options: opt.categories.map((c) => ({ value: String(c.id), label: c.name })) },
          { name: "user", label: "Recorded by", type: "select", options: users.map((u) => ({ value: String(u.id), label: u.name })) },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
        ]}
      />
      {rows.length === 0 ? (
        <Empty title="No movements match"><p>Widen the date range or reset the filters.</p></Empty>
      ) : (
        <>
          <HistoryTable rows={rows} s={s} />
          <Pager page={page} size={SIZE} total={total} base={base} />
        </>
      )}
    </>
  );
}
