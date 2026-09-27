"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, getSettings, getUser, requireUser, startSession, verifyPassword } from "@/lib/auth";
import { getDb, hashPassword, q } from "@/lib/db";
import { recordMovement } from "@/lib/stock";
import type { MovementType } from "@/lib/types";

export interface FormState {
  error?: string;
  ok?: string;
  result?: { productId: number; previous: number; next: number; uom: string; type: MovementType; quantity: number; at: number };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const intOrNull = (s: string) => (s === "" ? null : /^\d+$/.test(s) ? Number(s) : NaN);

/* ---------- auth ---------- */
export async function login(_: FormState, f: FormData): Promise<FormState> {
  const username = str(f, "username").toLowerCase();
  const pw = String(f.get("password") ?? "");
  const rows = await q<{ id: number; password_hash: string; active: boolean }>(
    "SELECT id,password_hash,active FROM users WHERE username=$1", [username]);
  const u = rows[0];
  if (!u || !u.active || !verifyPassword(pw, u.password_hash)) return { error: "Username or password is incorrect." };
  await startSession(u.id);
  redirect("/");
}
export async function logout() {
  await endSession();
  redirect("/login");
}

/* ---------- stock ---------- */
export async function moveStock(_: FormState, f: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) return { error: "Your session has ended. Sign in again." };
  const type = str(f, "type") as MovementType;
  if (!["opening", "in", "sale", "damage", "return"].includes(type)) return { error: "Unknown movement type." };
  if (type === "return") return { error: "Returns are processed from the original sale in Stock History." };
  const productId = Number(str(f, "productId"));
  if (!productId) return { error: "Select a product." };
  const qtyRaw = str(f, "quantity").replace(/,/g, "");
  if (!/^\d+$/.test(qtyRaw)) return { error: "Enter a whole quantity greater than 0." };
  const amountRaw = str(f, "amount").replace(/,/g, "");
  if (amountRaw && !/^\d+(\.\d{1,2})?$/.test(amountRaw)) return { error: "Amount must be a number, up to 2 decimals." };
  const s = await getSettings();
  const r = await recordMovement({
    productId, type, quantity: Number(qtyRaw), amount: amountRaw ? Number(amountRaw) : null,
    reason: str(f, "reason"), userId: user.id, role: user.role, storeCanDamage: s.storeCanDamage,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath("/", "layout");
  return { result: { productId, previous: r.previous, next: r.next, uom: r.uom, type, quantity: Number(qtyRaw), at: Date.now() } };
}

/* ---------- products ---------- */
export async function saveProduct(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("admin");
  const id = Number(str(f, "id")) || null;
  const name = str(f, "name"), sku = str(f, "sku");
  if (!name || !sku) return { error: "Product name and SKU are required." };
  const min = intOrNull(str(f, "min_stock"));
  if (Number.isNaN(min)) return { error: "Minimum stock must be a whole number, or empty." };
  const cat = str(f, "category_id") ? Number(str(f, "category_id")) : null;
  const vals = [name, sku, str(f, "description") || null, str(f, "dimension"), str(f, "uom") || "PCS", cat, min];
  try {
    if (id) {
      await q("UPDATE products SET name=$1,sku=$2,description=$3,dimension=$4,uom=$5,category_id=$6,min_stock=$7 WHERE id=$8", [...vals, id]);
    } else {
      const open = intOrNull(str(f, "opening"));
      if (Number.isNaN(open)) return { error: "Opening stock must be a whole number." };
      const db = await getDb();
      const created = await db.query<{ id: number }>(
        "INSERT INTO products (name,sku,description,dimension,uom,category_id,min_stock) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id", vals);
      if (open) {
        const r = await recordMovement({ productId: created.rows[0].id, type: "opening", quantity: open, userId: user.id, role: "admin", storeCanDamage: true });
        if (!r.ok) return { error: r.error };
      }
    }
  } catch (e) {
    if (String(e).includes("unique")) return { error: `SKU "${sku}" is already used by another product.` };
    return { error: "Product was not saved." };
  }
  revalidatePath("/", "layout");
  redirect("/products");
}
export async function setArchived(id: number, archived: boolean) {
  await requireUser("admin");
  await q("UPDATE products SET archived=$1 WHERE id=$2", [archived, id]);
  revalidatePath("/", "layout");
}

/* ---------- categories ---------- */
export async function saveCategory(_: FormState, f: FormData): Promise<FormState> {
  await requireUser("admin");
  const name = str(f, "name");
  if (!name) return { error: "Category name is required." };
  const id = Number(str(f, "id")) || null;
  try {
    if (id) await q("UPDATE categories SET name=$1 WHERE id=$2", [name, id]);
    else await q("INSERT INTO categories (name) VALUES ($1)", [name]);
  } catch {
    return { error: `Category "${name}" already exists.` };
  }
  revalidatePath("/", "layout");
  return { ok: id ? "Category renamed." : "Category added." };
}
export async function deleteCategory(id: number) {
  await requireUser("admin");
  await q("DELETE FROM categories WHERE id=$1", [id]);
  revalidatePath("/", "layout");
}

const FAMILIES: [RegExp, string][] = [
  [/^Y Tee/i, "Y Tees"], [/^Y UPVC/i, "Y Tees"], [/^(Swept )?Tee/i, "Tees"], [/Elbow/i, "Elbows"], [/^Reducer/i, "Reducers"],
  [/^Coupler/i, "Couplers"], [/^Socket/i, "Sockets"], [/^Floor Trap/i, "Floor Traps"], [/Syphon|Trap/i, "Traps"], [/Solvent Cement/i, "PVC Solvent Cement"],
];
/** Admin-initiated: fills category only where empty. Never edits names or descriptions. */
export async function autoAssignCategories(): Promise<void> {
  await requireUser("admin");
  const ps = await q<{ id: number; name: string }>("SELECT id,name FROM products WHERE category_id IS NULL");
  for (const p of ps) {
    const fam = FAMILIES.find(([re]) => re.test(p.name))?.[1];
    if (!fam) continue;
    const c = await q<{ id: number }>("INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id", [fam]);
    await q("UPDATE products SET category_id=$1 WHERE id=$2", [c[0].id, p.id]);
  }
  revalidatePath("/", "layout");
}

/* ---------- users ---------- */
export async function createUser(_: FormState, f: FormData): Promise<FormState> {
  await requireUser("admin");
  const username = str(f, "username").toLowerCase(), name = str(f, "name"), role = str(f, "role"), pw = String(f.get("password") ?? "");
  if (!username || !name) return { error: "Username and name are required." };
  if (!["admin", "store"].includes(role)) return { error: "Choose a role." };
  if (pw.length < 8) return { error: "Password must be at least 8 characters." };
  try {
    await q("INSERT INTO users (username,name,role,password_hash) VALUES ($1,$2,$3,$4)", [username, name, role, hashPassword(pw)]);
  } catch {
    return { error: `Username "${username}" is taken.` };
  }
  revalidatePath("/users");
  return { ok: "User created." };
}
export async function setUserActive(id: number, active: boolean) {
  const me = await requireUser("admin");
  if (me.id === id) return;
  await q("UPDATE users SET active=$1 WHERE id=$2", [active, id]);
  revalidatePath("/users");
}
export async function resetPassword(_: FormState, f: FormData): Promise<FormState> {
  await requireUser("admin");
  const pw = String(f.get("password") ?? "");
  if (pw.length < 8) return { error: "Password must be at least 8 characters." };
  await q("UPDATE users SET password_hash=$1 WHERE id=$2", [hashPassword(pw), Number(str(f, "id"))]);
  return { ok: "Password changed." };
}

/* ---------- settings ---------- */
export async function saveSettings(_: FormState, f: FormData): Promise<FormState> {
  await requireUser("admin");
  const tz = str(f, "timezone");
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return { error: "Unknown timezone." }; }
  const entries: [string, string][] = [
    ["company_name", str(f, "company_name") || "Conqueron Trading plc"],
    ["currency", str(f, "currency").toUpperCase() || "ETB"],
    ["timezone", tz],
    ["store_can_damage", f.get("store_can_damage") ? "true" : "false"],
  ];
  for (const [k, v] of entries)
    await q("INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [k, v]);
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}

/* ---------- returns (Admin only, always linked to a sale) ---------- */
export async function returnSale(_: FormState, f: FormData): Promise<FormState> {
  const user = await getUser();
  if (!user) return { error: "Your session has ended. Sign in again." };
  if (user.role !== "admin") return { error: "Only Admin can process returns." };
  const saleId = Number(str(f, "saleId"));
  if (!saleId) return { error: "Open the original sale to process a return." };
  const qtyRaw = str(f, "quantity").replace(/,/g, "");
  if (!/^\d+$/.test(qtyRaw)) return { error: "Enter a whole return quantity greater than 0." };
  const amountRaw = str(f, "amount").replace(/,/g, "");
  if (amountRaw && !/^\d+(\.\d{1,2})?$/.test(amountRaw)) return { error: "Amount must be a number, up to 2 decimals." };
  const s = await getSettings();
  const r = await recordMovement({
    productId: 0, type: "return", sourceMovementId: saleId, quantity: Number(qtyRaw),
    amount: amountRaw ? Number(amountRaw) : null, reason: str(f, "reason"),
    userId: user.id, role: user.role, storeCanDamage: s.storeCanDamage,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath("/", "layout");
  redirect(`/history/${saleId}?returned=${qtyRaw}`);
}
