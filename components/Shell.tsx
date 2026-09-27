import type { ReactNode } from "react";
import { Suspense } from "react";
import { ArrowUUpLeft, Package, SquaresFour, Tag, ClockCounterClockwise, Users, GearSix, Plus, Minus, Warning, SignOut, ListChecks } from "@phosphor-icons/react/dist/ssr";
import { logout } from "@/app/actions";
import { getSettings, requireUser } from "@/lib/auth";
import AppNav, { type NavItem } from "./AppNav";

const ic = { size: 18, weight: "regular" as const };

export default async function Shell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const s = await getSettings();
  const admin = user.role === "admin";
  const items: NavItem[] = [
    { href: "/", label: "Dashboard", icon: <SquaresFour {...ic} /> },
    { href: "/inventory", label: "Inventory", icon: <Package {...ic} /> },
    { href: "/inventory?status=low", label: "Low Stock", sub: true },
    { href: "/inventory?status=out", label: "Out of Stock", sub: true },
    { heading: "Products", href: "" , label: ""},
    { href: "/products", label: "Products", icon: <ListChecks {...ic} /> },
    ...(admin ? [{ href: "/categories", label: "Categories", icon: <Tag {...ic} /> }] : []),
    { heading: "Stock", href: "", label: "" },
    { href: "/stock/in", label: "Stock In", icon: <Plus {...ic} /> },
    { href: "/stock/sale", label: "Sale / Stock Out", icon: <Minus {...ic} /> },
    ...(admin || s.storeCanDamage ? [{ href: "/stock/damage", label: "Damage", icon: <Warning {...ic} /> }] : []),
    ...(admin ? [{ href: "/stock/return", label: "Return", icon: <ArrowUUpLeft {...ic} /> }] : []),
    { heading: "Records", href: "", label: "" },
    { href: "/history", label: "Stock History", icon: <ClockCounterClockwise {...ic} /> },
    ...(admin ? [
      { heading: "Admin", href: "", label: "" },
      { href: "/users", label: "Users", icon: <Users {...ic} /> },
      { href: "/settings", label: "Settings", icon: <GearSix {...ic} /> },
    ] : []),
  ];
  return (
    <div className="shell">
      <Suspense>
        <AppNav
          items={items}
          company={s.company}
          userName={user.name}
          role={user.role}
          logout={
            <form action={logout}>
              <button className="btn sm" aria-label="Sign out"><SignOut size={16} /></button>
            </form>
          }
        />
      </Suspense>
      <main className="main" id="main">{children}</main>
    </div>
  );
}
