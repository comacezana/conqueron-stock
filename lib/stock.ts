import { getDb } from "./db";
import type { MovementType, Role } from "./types";
import { CORRECTABLE, isIncrease } from "./types";

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
  if (i.type === "adjustment") return { ok: false, error: "Corrections are recorded with Correct stock, by an Admin." };
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
        // returned so far, and any Admin correction of the sale quantity itself
        const rt = await tx.query<{ n: number; adj: number }>(
          `SELECT COALESCE(sum(quantity) FILTER (WHERE type = 'return'),0)::int n,
                  COALESCE(sum(new_stock - previous_stock) FILTER (WHERE type = 'adjustment'),0)::int adj
           FROM stock_movements WHERE source_movement_id=$1`, [source.id]);
        const remaining = source.quantity - rt[0].adj - rt[0].n;
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

export interface CorrectionInput {
  /** Correct the product's stock to a counted total (target = correct current stock). */
  productId?: number;
  /** Or correct one entry (target = what that entry should have been). The fix links to it. */
  sourceMovementId?: number;
  target: number;
  reason: string;
  userId: number;
  role: Role;
}
export type CorrectionResult =
  | { ok: true; previous: number; next: number; uom: string; productId: number; sourceMovementId: number | null }
  | { ok: false; error: string };

/**
 * Admin-only stock correction. Never edits history: it adds one "adjustment" movement for the
 * difference, with a mandatory reason, optionally linked to the entry that was wrong.
 * Same guarantees as recordMovement: row lock, no negative stock, all-or-nothing.
 */
export async function recordCorrection(i: CorrectionInput): Promise<CorrectionResult> {
  if (i.role !== "admin") return { ok: false, error: "Only Admin can correct stock." };
  if (!Number.isInteger(i.target) || i.target < 0) return { ok: false, error: "Enter a whole number, 0 or more." };
  if (i.target > 100_000_000) return { ok: false, error: "Quantity is too large." };
  const reason = i.reason?.trim();
  if (!reason) return { ok: false, error: "A reason is required for every correction." };
  if (!i.sourceMovementId && !i.productId) return { ok: false, error: "Choose a product or an entry to correct." };
  const fmt = (n: number) => n.toLocaleString("en-US");

  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      let productId = i.productId ?? 0;
      let src: { id: number; type: MovementType; quantity: number } | null = null;
      if (i.sourceMovementId) {
        const sr = await tx.query<{ id: number; type: MovementType; product_id: number; quantity: number }>(
          "SELECT id,type,product_id,quantity FROM stock_movements WHERE id=$1", [i.sourceMovementId]);
        if (!sr[0]) return { ok: false as const, error: "That entry was not found." };
        if (!CORRECTABLE.includes(sr[0].type))
          return { ok: false as const, error: "Only Opening Stock, Stock In, Sale and Damage entries can be corrected. For anything else, use Correct stock on the product." };
        productId = sr[0].product_id;
        src = { id: sr[0].id, type: sr[0].type, quantity: sr[0].quantity };
      }
      const r = await tx.query<{ current_stock: number; archived: boolean; uom: string }>(
        "SELECT current_stock, archived, uom FROM products WHERE id=$1 FOR UPDATE", [productId]);
      const p = r[0];
      if (!p) return { ok: false as const, error: "Product not found." };
      if (p.archived) return { ok: false as const, error: "This product is archived. Restore it before correcting stock." };

      const prev = p.current_stock;
      let delta: number;
      if (src) {
        const agg = await tx.query<{ adj: number; returned: number }>(
          `SELECT COALESCE(sum(new_stock - previous_stock) FILTER (WHERE type = 'adjustment'),0)::int adj,
                  COALESCE(sum(quantity) FILTER (WHERE type = 'return'),0)::int returned
           FROM stock_movements WHERE source_movement_id=$1`, [src.id]);
        const adds = src.type === "opening" || src.type === "in";
        const effective = adds ? src.quantity + agg[0].adj : src.quantity - agg[0].adj;
        if (i.target === effective) return { ok: false as const, error: `This entry is already ${fmt(effective)} ${p.uom}. Nothing to change.` };
        if (src.type === "sale" && i.target < agg[0].returned)
          return { ok: false as const, error: `${fmt(agg[0].returned)} ${p.uom} have been returned from this sale, so it cannot be set below ${fmt(agg[0].returned)}.` };
        delta = adds ? i.target - effective : effective - i.target;
      } else {
        if (i.target === prev) return { ok: false as const, error: `Stock is already ${fmt(prev)} ${p.uom}. Nothing to change.` };
        delta = i.target - prev;
      }
      const next = prev + delta;
      if (next < 0)
        return { ok: false as const, error: `This correction would take stock below zero. Only ${fmt(prev)} ${p.uom} are in stock now.` };

      await tx.query(
        `INSERT INTO stock_movements (product_id,type,quantity,previous_stock,new_stock,reason,source_movement_id,created_by)
         VALUES ($1,'adjustment',$2,$3,$4,$5,$6,$7)`,
        [productId, Math.abs(delta), prev, next, reason, src?.id ?? null, i.userId],
      );
      await tx.query("UPDATE products SET current_stock=$1 WHERE id=$2", [next, productId]);
      return { ok: true as const, previous: prev, next, uom: p.uom, productId, sourceMovementId: src?.id ?? null };
    });
  } catch {
    return { ok: false, error: "The correction was not saved. Reload the page and try again." };
  }
}
