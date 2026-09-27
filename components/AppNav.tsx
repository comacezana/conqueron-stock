"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { List, X } from "@phosphor-icons/react";

export interface NavItem { href: string; label: string; icon?: ReactNode; sub?: boolean; heading?: string }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

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

  const brand = (
    <div className="brand">
      <span className="mark" aria-hidden="true">{company.trim()[0]?.toUpperCase() ?? "C"}</span>
      <div><b>{company}</b><span>Stock ledger</span></div>
    </div>
  );

  return (
    <>
      <div className="topbar">
        <button className="btn ghost sm" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}><List size={20} /></button>
        {brand}
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`side${open ? " open" : ""}`} aria-label="Main navigation">
        <div className="side-top">
          {brand}
          {open && <button className="btn ghost sm" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>}
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
          <span className="avatar" aria-hidden="true">{initials(userName)}</span>
          <div className="who-t"><b>{userName}</b><small>{role === "admin" ? "Admin" : "Store"}</small></div>
          {logout}
        </div>
      </aside>
    </>
  );
}
