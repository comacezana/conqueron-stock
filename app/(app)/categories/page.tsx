import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { autoAssignCategories, deleteCategory } from "@/app/actions";
import { CategoryForm } from "@/components/AdminForms";
import { Empty, PageHead } from "@/components/ui";

export default async function CategoriesPage() {
  await requireUser("admin");
  const cats = await q<{ id: number; name: string; n: number }>(
    "SELECT c.id,c.name,count(p.id)::int n FROM categories c LEFT JOIN products p ON p.category_id=c.id GROUP BY c.id ORDER BY c.name");
  const [{ n: uncat }] = await q<{ n: number }>("SELECT count(*)::int n FROM products WHERE category_id IS NULL AND archived=FALSE");
  return (
    <>
      <PageHead title="Categories" desc="Categories only organise products. They never change official descriptions." />
      <div className="grid2" style={{ alignItems: "start", gap: 40 }}>
        <section>
          <div className="sec-h"><h2 style={{ font: "inherit" }}>Add category</h2></div>
          <CategoryForm />
          <div style={{ marginTop: 32 }}>
            <div className="sec-h"><h2 style={{ font: "inherit" }}>Suggest from product names</h2></div>
            <p className="dim" style={{ marginBottom: 12, maxWidth: "52ch" }}>
              Creates families such as Elbows, Tees, Reducers and Traps and fills them in for the {uncat} products that have no category. Existing categories are not changed.
            </p>
            <form action={autoAssignCategories}><button className="btn" disabled={uncat === 0}>Assign categories to {uncat} products</button></form>
          </div>
        </section>
        <section>
          <div className="sec-h"><h2 style={{ font: "inherit" }}>All categories</h2></div>
          {cats.length === 0 ? <Empty title="No categories yet"><p>Add one, or use the suggestion button to build them from the catalog.</p></Empty> : (
            <ul className="feed">
              {cats.map((c) => (
                <li key={c.id} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                  <CategoryForm id={c.id} name={c.name} />
                  <div className="actions" style={{ alignItems: "center" }}>
                    <Link href={`/inventory?category=${c.id}`} className="link">{c.n} products</Link>
                    <form action={deleteCategory.bind(null, c.id)}><button className="btn sm danger">Delete</button></form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
