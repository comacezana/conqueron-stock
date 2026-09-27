"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { sendReport, type FormState } from "@/app/actions";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" disabled={pending || disabled}>
      <EnvelopeSimple size={16} />
      {pending ? "Sending..." : "Send PDF"}
    </button>
  );
}

export default function SendReportForm({ month, defaultTo, mailReady }: { month: string; defaultTo: string; mailReady: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(sendReport, {});
  return (
    <form action={action} className="sendbox">
      <input type="hidden" name="month" value={month} />
      <div className="field">
        <label htmlFor="to">Send to</label>
        <div className="sendrow">
          <input id="to" name="to" className="input" defaultValue={defaultTo} placeholder="owner@example.com" autoComplete="off" required disabled={!mailReady} />
          <Submit disabled={!mailReady} />
        </div>
        <span className="hint">
          {mailReady ? "Separate addresses with commas. The PDF is attached to the email." : "Email is not set up on the server yet. Download the PDF instead, or add the SMTP settings."}
        </span>
      </div>
      {state.error && <div className="err" role="alert">{state.error}</div>}
      {state.ok && <div className="okmsg" role="status">{state.ok}</div>}
    </form>
  );
}
