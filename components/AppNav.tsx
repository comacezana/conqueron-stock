"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { List, X } from "@phosphor-icons/react";

export interface NavItem { href: string; label: string; icon?: ReactNode; sub?: boolean; heading?: string }

export default function AppNav({
  items, company, userName, role, logout,
}: { items: NavItem[]; company: string; userName: string; role: string; logout: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const sp = useSearchParams();

  const active = (href: string) => {
    const [p, qs] = href.split("?");
    if (path !== p && !(p !== "/" && path.startsWith(p + "/") && !items.some((i) => i.href.split("?")[0] === path))) return false;
    if (p === "/inventory") {
      const want = qs ? new URLSearchParams(qs).get("status") : null;
      const has = sp.get("status");
      return want ? has === want : has !== "low" && has !== "out";
    }
    return true;
  };

  return (
    <>
      <div className="topbar">
        <button className="btn sm" onClick={() => setOpen(true)} aria-label="Open menu"><List size={18} weight="bold" /></button>
        <b>{company}</b>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`side${open ? " open" : ""}`} aria-label="Main navigation">
        <div className="brand" style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div><b>{company}</b><span>Stock ledger</span></div>
          {open && <button className="btn sm" onClick={() => setOpen(false)} aria-label="Close menu"><X size={16} /></button>}
        </div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {items.map((it) =>
            it.heading ? <div key={it.heading} className="nav-h">{it.heading}</div> : (
              <Link key={it.href} href={it.href} className={it.sub ? "sub" : undefined} aria-current={active(it.href) ? "page" : undefined}>
                {it.icon}{it.label}
              </Link>
            ))}
        </nav>
        <div className="who">
          <div><b>{userName}</b><small>{role}</small></div>
          {logout}
        </div>
      </aside>
    </>
  );
}
