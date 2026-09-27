import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { filterOptions, getProduct } from "@/lib/queries";
import ProductForm from "@/components/ProductForm";
import { PageHead } from "@/components/ui";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("admin");
  const p = await getProduct(Number((await params).id));
  if (!p) notFound();
  const { categories } = await filterOptions();
  return (
    <>
      <PageHead title="Edit product" desc="Changing the name or SKU does not alter past movements; history stays attached to this product." />
      <ProductForm product={p} categories={categories} />
    </>
  );
}
