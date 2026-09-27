import { requireUser } from "@/lib/auth";
import { filterOptions } from "@/lib/queries";
import ProductForm from "@/components/ProductForm";
import { PageHead } from "@/components/ui";

export default async function NewProduct() {
  await requireUser("admin");
  const { categories } = await filterOptions();
  return (
    <>
      <PageHead title="Add product" desc="Only inventory fields. Prices are recorded per sale, never on the product." />
      <ProductForm categories={categories} />
    </>
  );
}
