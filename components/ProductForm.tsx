"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveProduct, type FormState } from "@/app/actions";
import type { ProductRow } from "@/lib/types";

export default function ProductForm({ product, categories }: { product?: ProductRow; categories: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProduct, {});
  return (
    <form action={action} className="form">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="field">
        <label htmlFor="name">Product name</label>
        <input id="name" name="name" className="input" defaultValue={product?.name} required />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="sku">SKU / Article number</label>
          <input id="sku" name="sku" className="input mono" defaultValue={product?.sku} required />
        </div>
        <div className="field">
          <label htmlFor="dimension">Dimension</label>
          <input id="dimension" name="dimension" className="input" defaultValue={product?.dimension} placeholder="e.g. 110mm" />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="uom">Unit of measure</label>
          <input id="uom" name="uom" className="input" defaultValue={product?.uom ?? "PCS"} required />
        </div>
        <div className="field">
          <label htmlFor="category_id">Category</label>
          <select id="category_id" name="category_id" className="input" defaultValue={product?.category_id ?? ""}>
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="min_stock">Minimum stock level</label>
        <input id="min_stock" name="min_stock" className="input num" inputMode="numeric" defaultValue={product?.min_stock ?? ""} placeholder="Leave empty if not set" />
        <span className="hint">At or below this level the product shows LOW STOCK.</span>
      </div>
      <div className="field">
        <label htmlFor="description">Description (optional)</label>
        <textarea id="description" name="description" className="input" defaultValue={product?.description ?? ""} />
      </div>
      {!product && (
        <div className="field">
          <label htmlFor="opening">Opening stock (optional)</label>
          <input id="opening" name="opening" className="input num" inputMode="numeric" placeholder="0" />
          <span className="hint">Recorded as an Opening Stock movement in the history.</span>
        </div>
      )}
      {product && <p className="dim">Current stock is changed through stock movements only, never edited here.</p>}
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <div className="actions">
        <button className="btn primary" disabled={pending}>{pending ? "Saving..." : product ? "Save changes" : "Add product"}</button>
        <Link className="btn" href="/products">Cancel</Link>
      </div>
    </form>
  );
}
