import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { q } from "./db";
import type { Role, User } from "./types";

const COOKIE = "sid";
const TTL = 60 * 60 * 12;

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.DATABASE_URL) {
    // Running against a real Postgres (Neon, etc.) usually means no durable local disk to
    // persist a generated secret on (e.g. serverless). A different secret per cold start would
    // invalidate every session, so require one explicitly instead of failing unpredictably.
    throw new Error("SESSION_SECRET must be set when DATABASE_URL is set (no durable local disk to store a generated one on).");
  }
  const f = path.join(process.cwd(), "data", ".secret");
  if (!fs.existsSync(f)) fs.writeFileSync(f, randomBytes(32).toString("hex"));
  return fs.readFileSync(f, "utf8");
}
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");

export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pw, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function startSession(uid: number) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + TTL * 1000 })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
  });
}
export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getUser(): Promise<User | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expect = sign(payload);
  if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (exp < Date.now()) return null;
    const rows = await q<User>("SELECT id,username,name,role,active FROM users WHERE id=$1", [uid]);
    return rows[0]?.active ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function requireUser(role?: Role): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  if (role && u.role !== role) redirect("/?denied=1");
  return u;
}

export async function getSettings() {
  const rows = await q<{ key: string; value: string }>("SELECT key,value FROM settings");
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    company: m.company_name ?? "Conqueron Trading plc",
    currency: m.currency ?? "ETB",
    timezone: m.timezone ?? "Africa/Addis_Ababa",
    storeCanDamage: m.store_can_damage === "true",
    reportRecipients: m.report_recipients ?? "",
  };
}
export type Settings = Awaited<ReturnType<typeof getSettings>>;
