import type { MovementType } from "./types";
import { isIncrease } from "./types";

export const num = (n: number) => new Intl.NumberFormat("en-US").format(n);
export const signed = (t: MovementType, n: number) => `${isIncrease(t) ? "+" : "−"}${num(n)}`;
/** Signed change from a movement's own before/after balances. Right for every type, including corrections. */
export const change = (prev: number, next: number) => `${next >= prev ? "+" : "−"}${num(Math.abs(next - prev))}`;
export const money = (v: string | number, cur: string) =>
  `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))} ${cur}`;

export function when(d: Date | string, tz: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(d));
}
