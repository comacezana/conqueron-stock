"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { moveStock, type FormState } from "@/app/actions";
import type { MovementType } from "@/lib/types";
import { statusOf } from "@/lib/types";

export interface PickProduct { id: number; sku: string; name: string; dimension: string; uom: string; stock: number; min: number | null }

const COPY: Record<Exclude<MovementType, "return" | "opening" | "adjustment">, { title: string; cta: string; sign: 1 | -1 }> = {
  in: { title: "Stock In", cta: "Save Stock In", sign: 1 },
  sale: { title: "Sale / Stock Out", cta: "Save sale", sign: -1 },
  damage: { title: "Damage", cta: "Save damage", sign: -1 },
};

function Submit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn primary" disabled={pending || disabled} style={{ minHeight: 44 }}>{pending ? "Saving..." : label}</button>;
}

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

export default function MovementForm({
  type, products, initialId, currency,
}: { type: Exclude<MovementType, "return" | "opening" | "adjustment">; products: PickProduct[]; initialId?: number; currency: string }) {
  const c = COPY[type];
  const [state, action] = useActionState<FormState, FormData>(moveStock, {});
  const [sel, setSel] = useState<number | null>(initialId ?? null);
  const [term, setTerm] = useState("");
  const [qty, setQty] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const toks = term.toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((p) => toks.every((t) => `${p.name} ${p.sku} ${p.dimension}`.toLowerCase().includes(t))).slice(0, 60);
  }, [term, products]);
  const cur = products.find((p) => p.id === sel) ?? null;
  const n = /^\d+$/.test(qty) ? Number(qty) : 0;
  const stock = cur?.stock ?? 0;
  const next = cur ? stock + c.sign * n : 0;
  const over = cur !== null && c.sign < 0 && n > stock;

  useEffect(() => {
    if (state.result) { setQty(""); formRef.current?.reset(); qtyRef.current?.focus(); }
  }, [state.result]);

  const r = state.result;
  const shown = r && r.productId ? products.find((p) => p.id === r.productId) : null;

  return (
    <div className="mv">
      <form ref={formRef} action={action} className="form" style={{ maxWidth: "none" }}>
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="productId" value={sel ?? ""} />
        <div className="field">
          <span className="lbl" id="pl">Product</span>
          <div className="picker" role="group" aria-labelledby="pl">
            <div style={{ position: "relative" }}>
              <MagnifyingGlass size={18} style={{ position: "absolute", left: 14, top: 13, color: "var(--text-3)" }} />
              <input className="input" style={{ paddingLeft: 42 }} placeholder="Search by name, SKU or dimension..." value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search products" autoComplete="off" />
            </div>
            <div className="list" role="listbox" aria-label="Products">
              {list.length === 0 && <p className="dim" style={{ padding: 14 }}>No product matches &ldquo;{term}&rdquo;.</p>}
              {list.map((p) => (
                <button type="button" key={p.id} role="option" aria-selected={p.id === sel} className="opt" onClick={() => { setSel(p.id); setTimeout(() => qtyRef.current?.focus(), 0); }}>
                  <span><b style={{ fontWeight: 550 }}>{p.name}</b><br /><span className="mono dim">{p.sku}</span> <span className="dim">· {p.dimension}</span></span>
                  <span className="num" style={{ fontWeight: 650, alignSelf: "center" }}>{fmt(p.stock)} <span className="dim">{p.uom}</span></span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="qty">Quantity{type === "sale" ? " sold" : ""}</label>
          <div className="qtyrow">
            <input id="qty" ref={qtyRef} name="quantity" className="input num" inputMode="numeric" autoComplete="off" value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} aria-invalid={over || !!state.error} aria-describedby="qhint" required />
            <span className="uom">{cur?.uom ?? "PCS"}</span>
          </div>
          <span id="qhint" className={over ? "hint neg" : "hint"} role={over ? "alert" : undefined}>
            {over ? `Insufficient stock. Only ${fmt(stock)} ${cur!.uom} are available.` : c.sign < 0 && cur ? `Available: ${fmt(stock)} ${cur.uom}` : "Whole numbers only."}
          </span>
        </div>

        {type === "sale" && (
          <div className="field">
            <label htmlFor="amount">Amount sold ({currency})</label>
            <input id="amount" name="amount" className="input num" inputMode="decimal" placeholder="Optional" autoComplete="off" />
            <span className="hint">Recorded for this transaction only. No totals are calculated.</span>
          </div>
        )}
        {type === "damage" && (
          <div className="field">
            <label htmlFor="reason">Damage reason</label>
            <textarea id="reason" name="reason" className="input" required placeholder="e.g. Damaged during handling" />
          </div>
        )}

        {state.error && <div className="err" role="alert">{state.error}</div>}
        {r && shown && (
          <div className="okmsg" role="status">
            Stock updated. New balance: <b className="num">{fmt(r.next)} {r.uom}</b> for {shown.sku}.{" "}
            <Link href={`/products/${r.productId}`} className="link">View history</Link>
          </div>
        )}
        <div className="actions"><Submit label={c.cta} disabled={!cur || n === 0 || over} /></div>
      </form>

      <aside className="review" aria-label="Movement review" aria-live="polite">
        <span className="lbl">{c.title} · review</span>
        {cur ? (
          <>
            <div><b style={{ fontWeight: 600 }}>{cur.name}</b><div className="dim"><span className="mono">{cur.sku}</span> · {cur.dimension} · {cur.uom}</div></div>
            <div className="row"><span>Previous stock</span><b>{fmt(stock)}</b></div>
            <div className="row"><span>{c.title}</span><b className={c.sign > 0 ? "pos" : "neg"}>{c.sign > 0 ? "+" : "−"}{fmt(n)}</b></div>
            <div className="row" style={{ borderTop: "1px solid var(--hair)", paddingTop: 10 }}>
              <span>New stock</span><b className="big">{over ? "-" : fmt(next)}</b>
            </div>
            <span className="badge in" style={{ display: over ? "none" : undefined, ...(badgeStyle(next, cur.min)) }}>{statusText(next, cur.min)}</span>
          </>
        ) : <p className="dim">Select a product to see the resulting balance.</p>}
      </aside>
    </div>
  );
}

const statusText = (s: number, min: number | null) => ({ in: "IN STOCK", low: "LOW STOCK", out: "OUT OF STOCK", unset: "MINIMUM NOT SET" })[statusOf(s, min)];
const badgeStyle = (s: number, min: number | null) => {
  const st = statusOf(s, min);
  const m = { in: ["--ok-t", "--ok-b"], low: ["--warn-t", "--warn-b"], out: ["--bad-t", "--bad-b"], unset: ["--text-2", "--muted"] }[st];
  return { color: `var(${m[0]})`, background: `var(${m[1]})`, justifySelf: "start" as const };
};
