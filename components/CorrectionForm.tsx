"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { correctStock, type FormState } from "@/app/actions";

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn primary" style={{ minHeight: 44 }} disabled={pending || disabled}>{pending ? "Saving..." : "Save correction"}</button>;
}

type Props = { uom: string; stock: number; cancelHref: string } & (
  | { mode: "count"; productId: number }
  | { mode: "entry"; sourceId: number; entryLabel: string; recorded: number; effective: number; adds: boolean; floor: number }
);

export default function CorrectionForm(p: Props) {
  const [state, action] = useActionState<FormState, FormData>(correctStock, {});
  const [raw, setRaw] = useState("");
  const has = /^\d+$/.test(raw);
  const t = has ? Number(raw) : 0;

  const delta = !has ? 0 : p.mode === "count" ? t - p.stock : p.adds ? t - p.effective : p.effective - t;
  const next = p.stock + delta;
  const problem = !has ? null
    : delta === 0 ? "That is the same as now. Nothing would change."
    : next < 0 ? `This would take stock below zero. Only ${fmt(p.stock)} ${p.uom} are in stock now.`
    : p.mode === "entry" && t < p.floor ? `${fmt(p.floor)} ${p.uom} have been returned from this sale, so it cannot be set below ${fmt(p.floor)}.`
    : null;

  return (
    <div className="mv">
      <form action={action} className="form" style={{ maxWidth: "none" }}>
        {p.mode === "count" ? <input type="hidden" name="productId" value={p.productId} /> : <input type="hidden" name="sourceId" value={p.sourceId} />}
        <div className="field">
          <label htmlFor="target">{p.mode === "count" ? "Correct stock (what is really on hand)" : `What this ${p.entryLabel} should have been`}</label>
          <div className="qtyrow">
            <input id="target" name="target" className="input num" inputMode="numeric" autoComplete="off" autoFocus required value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ""))} aria-invalid={!!problem} aria-describedby="th" />
            <span className="uom">{p.uom}</span>
          </div>
          <span id="th" className={problem ? "hint neg" : "hint"} role={problem ? "alert" : undefined}>
            {problem ?? (p.mode === "count"
              ? `The system currently shows ${fmt(p.stock)} ${p.uom}.`
              : `Recorded as ${fmt(p.recorded)} ${p.uom}${p.effective !== p.recorded ? `, already corrected to ${fmt(p.effective)}` : ""}.`)}
          </span>
        </div>
        <div className="field">
          <label htmlFor="reason">Reason</label>
          <textarea id="reason" name="reason" className="input" required
            placeholder={p.mode === "count" ? "e.g. Physical count on 30 Sept" : "e.g. Typed 15000 instead of 1500"} />
          <span className="hint">Required. It is shown in the stock history next to this correction.</span>
        </div>
        {state.error && <div className="err" role="alert">{state.error}</div>}
        <div className="actions">
          <Submit disabled={!has || !!problem} />
          <Link href={p.cancelHref} className="btn">Cancel</Link>
        </div>
      </form>

      <aside className="review" aria-live="polite">
        <span className="lbl">Correction &middot; review</span>
        {p.mode === "entry" && (
          <div className="row"><span>{p.entryLabel[0].toUpperCase() + p.entryLabel.slice(1)}</span><b>{fmt(p.effective)} to {has ? fmt(t) : "?"}</b></div>
        )}
        <div className="row"><span>Stock now</span><b>{fmt(p.stock)}</b></div>
        <div className="row"><span>Change</span><b className={delta < 0 ? "neg" : delta > 0 ? "pos" : undefined}>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{fmt(Math.abs(delta))}</b></div>
        <div className="row" style={{ borderTop: "1px solid var(--hair)", paddingTop: 10 }}>
          <span>Stock after</span><b className="big">{!has || problem ? "-" : fmt(next)}</b>
        </div>
        <p className="dim">The original entry is never edited. This adds a Correction to the history, with your name and reason.</p>
      </aside>
    </div>
  );
}
