import { getDb } from "./db";
import type { MovementType, Role } from "./types";
import { isIncrease } from "./types";

export interface MovementInput {
  productId: number;
  type: MovementType;
  quantity: number;
  amount?: number | null;
  reason?: string | null;
  /** Required for type 'return': id of the original sale movement. */
  sourceMovementId?: number | null;
  userId: number;
  role: Role;
  storeCanDamage: boolean;
}
export type MovementResult =
  | { ok: true; previous: number; next: number; uom: string; productId: number }
  | { ok: false; error: string };

/** Single authoritative path for every stock change. Atomic, row-locked, server-validated. */
export async function recordMovement(i: MovementInput): Promise<MovementResult> {
  if (i.type === "return" && i.role !== "admin") return { ok: false, error: "Only Admin can process returns." };
  if (i.type === "opening" && i.role !== "admin") return { ok: false, error: "Only Admin can record opening stock." };
  if (i.type === "damage" && i.role !== "admin" && !i.storeCanDamage)
    return { ok: false, error: "Damage recording is turned off for Store users." };
  if (i.type === "return" && !i.sourceMovementId) return { ok: false, error: "A return must be linked to an original sale." };
  if (!Number.isInteger(i.quantity) || i.quantity <= 0) return { ok: false, error: "Enter a whole quantity greater than 0." };
  if (i.quantity > 100_000_000) return { ok: false, error: "Quantity is too large." };
  const reason = i.reason?.trim() || null;
  if ((i.type === "return" || i.type === "damage") && !reason)
    return { ok: false, error: `${i.type === "return" ? "Return" : "Damage"} reason is required.` };
  if (i.amount != null && (!Number.isFinite(i.amount) || i.amount < 0)) return { ok: false, error: "Amount must be 0 or more." };

  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      let productId = i.productId;
      let source: { id: number; quantity: number } | null = null;
      if (i.type === "return") {
        const sr = await tx.query<{ id: number; type: string; product_id: number; quantity: number }>(
          "SELECT id,type,product_id,quantity FROM stock_movements WHERE id=$1", [i.sourceMovementId ?? 0]);
        const sale = sr[0];
        if (!sale || sale.type !== "sale") return { ok: false as const, error: "A return must be linked to an original sale." };
        productId = sale.product_id;
        source = { id: sale.id, quantity: sale.quantity };
      } else if (i.sourceMovementId != null) {
        return { ok: false as const, error: "Only a return can reference a sale." };
      }
      const r = await tx.query<{ current_stock: number; archived: boolean; uom: string }>(
        "SELECT current_stock, archived, uom FROM products WHERE id=$1 FOR UPDATE",
        [productId],
      );
      const p = r[0];
      if (!p) return { ok: false as const, error: "Product not found." };
      if (p.archived) return { ok: false as const, error: "This product is archived. Restore it before recording stock." };
      if (i.type === "opening") {
        const c = await tx.query<{ n: number }>("SELECT count(*)::int n FROM stock_movements WHERE product_id=$1", [productId]);
        if (c[0].n > 0)
          return { ok: false as const, error: "Opening stock already exists for this product. Use Stock In instead." };
      }
      if (source) {
        // product row is locked, so concurrent returns of this sale are serialised
        const rt = await tx.query<{ n: number }>(
          "SELECT COALESCE(sum(quantity),0)::int n FROM stock_movements WHERE source_movement_id=$1", [source.id]);
        const remaining = source.quantity - rt[0].n;
        if (i.quantity > remaining)
          return {
            ok: false as const,
            error: remaining === 0
              ? "This sale has already been fully returned."
              : `Cannot return ${i.quantity.toLocaleString("en-US")} ${p.uom}. Only ${remaining.toLocaleString("en-US")} ${p.uom} remain returnable from this sale.`,
          };
      }
      const prev = p.current_stock;
      if (!isIncrease(i.type) && i.quantity > prev)
        return { ok: false as const, error: `Insufficient stock. Only ${prev.toLocaleString("en-US")} ${p.uom} are available.` };
      const next = isIncrease(i.type) ? prev + i.quantity : prev - i.quantity;
      const amount = i.type === "sale" || i.type === "return" ? (i.amount ?? null) : null;
      const storedReason = i.type === "damage" || i.type === "return" ? reason : null;
      await tx.query(
        `INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,amount,reason,source_movement_id,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [productId, i.type, i.quantity, prev, next, amount, storedReason, source?.id ?? null, i.userId],
      );
      await tx.query("UPDATE products SET current_stock=$1 WHERE id=$2", [next, productId]);
      return { ok: true as const, previous: prev, next, uom: p.uom, productId };
    });
  } catch {
    return { ok: false, error: "The movement was not saved. Reload the product and try again." };
  }
}
