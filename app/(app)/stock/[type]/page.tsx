import { notFound, redirect } from "next/navigation";
import { getSettings, requireUser } from "@/lib/auth";
import { first, listProducts, type SP } from "@/lib/queries";
import type { MovementType } from "@/lib/types";
import MovementForm from "@/components/MovementForm";
import { PageHead } from "@/components/ui";

const ROUTES: Record<string, { type: Exclude<MovementType, "return" | "opening" | "adjustment">; title: string; desc: string }> = {
  in: { type: "in", title: "Stock In", desc: "Choose a product and a quantity. That is all." },
  sale: { type: "sale", title: "Sale / Stock Out", desc: "Quantity sold and, if you have it, the amount for this sale." },
  damage: { type: "damage", title: "Damage", desc: "Record stock lost to damage, with the reason." },
};

export default async function StockPage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser();
  const cfg = ROUTES[(await params).type];
  if (!cfg) notFound();
  const s = await getSettings();
  if (cfg.type === "damage" && user.role !== "admin" && !s.storeCanDamage) redirect("/?denied=1");
  const sp = await searchParams;
  const rows = await listProducts({});
  const products = rows.map((p) => ({ id: p.id, sku: p.sku, name: p.name, dimension: p.dimension, uom: p.uom, stock: p.current_stock, min: p.min_stock }));
  const pre = Number(first(sp.product)) || undefined;
  return (
    <>
      <PageHead title={cfg.title} desc={cfg.desc} />
      <MovementForm key={cfg.type + (pre ?? "")} type={cfg.type} products={products} initialId={pre} currency={s.currency} />
    </>
  );
}
