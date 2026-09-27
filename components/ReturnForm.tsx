"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { returnSale, type FormState } from "@/app/actions";

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn primary" style={{ minHeight: 44 }} disabled={pending || disabled}>{pending ? "Saving..." : "Confirm return"}</button>;
}

export default function ReturnForm({
  saleId, uom, sold, returned, stock, currency,
}: { saleId: number; uom: string; sold: number; returned: number; stock: number; currency: string }) {
  const [state, action] = useActionState<FormState, FormData>(returnSale, {});
  const [qty, setQty] = useState("");
  const remaining = sold - returned;
  const n = /^\d+$/.test(qty) ? Number(qty) : 0;
  const over = n > remaining;

  return (
    <div className="mv">
      <form action={action} className="form" style={{ maxWidth: "none" }}>
        <input type="hidden" name="saleId" value={saleId} />
        <div className="field">
          <label htmlFor="qty">Return quantity</label>
          <div className="qtyrow">
            <input id="qty" name="quantity" className="input num" inputMode="numeric" autoComplete="off" autoFocus required value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} aria-invalid={over} aria-describedby="qh" />
            <span className="uom">{uom}</span>
          </div>
          <span id="qh" className={over ? "hint neg" : "hint"} role={over ? "alert" : undefined}>
            {over ? `Cannot return ${fmt(n)} ${uom}. Only ${fmt(remaining)} ${uom} remain returnable from this sale.` : `Up to ${fmt(remaining)} ${uom} can still be returned.`}
          </span>
        </div>
        <div className="field">
          <label htmlFor="amount">Return amount ({currency})</label>
          <input id="amount" name="amount" className="input num" inputMode="decimal" placeholder="Optional" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="reason">Return reason</label>
          <textarea id="reason" name="reason" className="input" required placeholder="e.g. Customer returned unused items" />
        </div>
        {state.error && <div className="err" role="alert">{state.error}</div>}
        <div className="actions">
          <Submit disabled={n === 0 || over} />
          <Link href={`/history/${saleId}`} className="btn">Cancel</Link>
        </div>
      </form>

      <aside className="review" aria-live="polite">
        <span className="lbl">Return &middot; review</span>
        <div className="row"><span>Originally sold</span><b>{fmt(sold)}</b></div>
        <div className="row"><span>Already returned</span><b>{fmt(returned)}</b></div>
        <div className="row"><span>Remaining returnable</span><b>{fmt(remaining)}</b></div>
        <div className="row" style={{ borderTop: "1px solid var(--hair)", paddingTop: 10 }}><span>Current stock</span><b>{fmt(stock)}</b></div>
        <div className="row"><span>Return</span><b className="pos">+{fmt(n)}</b></div>
        <div className="row"><span>New stock</span><b className="big">{over ? "-" : fmt(stock + n)}</b></div>
        <p className="dim">The original sale stays unchanged. This creates a separate return linked to it.</p>
      </aside>
    </div>
  );
}
