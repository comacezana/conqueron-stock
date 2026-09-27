"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

export interface FilterField {
  name: string; label: string; type: "select" | "date"; more?: boolean; options?: { value: string; label: string }[];
}

export default function FilterBar({
  fields, placeholder = "Search inventory...", helper, count,
}: { fields: FilterField[]; placeholder?: string; helper?: string; count?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const set = (name: string, value: string) => {
    const u = new URLSearchParams(sp.toString());
    if (value) u.set(name, value); else u.delete(name);
    u.delete("page");
    start(() => router.replace(`${path}${u.size ? `?${u}` : ""}`, { scroll: false }));
  };
  const qv = sp.get("q") ?? "";
  const chips: string[] = [];
  if (qv) chips.push(`Search: "${qv}"`);
  for (const f of fields) {
    const v = sp.get(f.name);
    if (!v) continue;
    chips.push(`${f.label}: ${f.options?.find((o) => o.value === v)?.label ?? v}`);
  }

  return (
    <div className="filters" aria-busy={pending}>
      <div className="searchbox" role="search">
        <label className="sr" htmlFor="q">{placeholder.replace("...", "")}</label>
        <MagnifyingGlass size={20} />
        <input
          id="q" key={qv} className="input" type="search" defaultValue={qv} placeholder={placeholder} autoComplete="off"
          onChange={(e) => { clearTimeout(timer.current); const v = e.target.value; timer.current = setTimeout(() => set("q", v.trim()), 220); }}
        />
        {qv && <button type="button" aria-label="Clear search" onClick={() => set("q", "")}><X size={16} /></button>}
      </div>
      {helper && <p className="dim" style={{ marginTop: -6 }}>{helper}</p>}
      <div className="frow">
        {fields.filter((f) => !f.more).map((f) => (
          <div className="field" key={f.name}>
            <label htmlFor={`f-${f.name}`}>{f.label}</label>
            {f.type === "select" ? (
              <select id={`f-${f.name}`} className="input" value={sp.get(f.name) ?? ""} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">All</option>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input id={`f-${f.name}`} className="input" type="date" value={sp.get(f.name) ?? ""} onChange={(e) => set(f.name, e.target.value)} />
            )}
          </div>
        ))}
        {chips.length > 0 && (
          <button type="button" className="btn" onClick={() => start(() => router.replace(path, { scroll: false }))}>Reset filters</button>
        )}
      </div>
      {fields.some((f) => f.more) && (
        <details className="more" open={fields.some((f) => f.more && sp.get(f.name))}>
          <summary>Movement filters</summary>
          <div className="frow">
        {fields.filter((f) => f.more).map((f) => (
          <div className="field" key={f.name}>
            <label htmlFor={`f-${f.name}`}>{f.label}</label>
            {f.type === "select" ? (
              <select id={`f-${f.name}`} className="input" value={sp.get(f.name) ?? ""} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">All</option>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input id={`f-${f.name}`} className="input" type="date" value={sp.get(f.name) ?? ""} onChange={(e) => set(f.name, e.target.value)} />
            )}
          </div>
        ))}
          </div>
        </details>
      )}
      <div className="chips">
        {count && <span className="count">{count}</span>}
        {chips.map((c) => <span className="chip" key={c}>{c}</span>)}
      </div>
    </div>
  );
}
