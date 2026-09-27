export type Role = "admin" | "store";
export type MovementType = "opening" | "in" | "sale" | "damage" | "return" | "adjustment";
export type StockStatus = "in" | "low" | "out" | "unset";

export interface User { id: number; username: string; name: string; role: Role; active: boolean }
export interface ProductRow {
  id: number; sku: string; name: string; description: string | null; dimension: string; uom: string;
  category_id: number | null; category: string | null; min_stock: number | null; current_stock: number; archived: boolean;
}
export interface MovementRow {
  id: number; product_id: number; sku: string; name: string; dimension: string; uom: string; type: MovementType;
  quantity: number; previous_stock: number; new_stock: number; amount: string | null; reason: string | null;
  created_by: number; user_name: string; user_role: Role; created_at: Date;
  source_movement_id: number | null;
  /** For sales: total quantity returned so far. */
  returned: number;
  /** The entry's quantity after any Admin corrections linked to it (equals quantity if never corrected). */
  corrected_quantity: number;
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  opening: "Opening Stock", in: "Stock In", sale: "Sale", damage: "Damage", return: "Return", adjustment: "Correction",
};
export const isIncrease = (t: MovementType) => t === "opening" || t === "in" || t === "return";
/** Entries an Admin can correct by linking a Correction to them. */
export const CORRECTABLE: MovementType[] = ["opening", "in", "sale", "damage"];

export function statusOf(stock: number, min: number | null): StockStatus {
  if (stock <= 0) return "out";
  if (min === null) return "unset";
  return stock <= min ? "low" : "in";
}

export const movementNo = (id: number) => `#${String(id).padStart(5, "0")}`;
