"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/app/actions";

export default function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} className="form">
      <div className="field">
        <label htmlFor="username">Username</label>
        <input id="username" name="username" className="input" autoComplete="username" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state.error && <div className="err" role="alert">{state.error}</div>}
      <button className="btn primary" disabled={pending} style={{ minHeight: 44 }}>{pending ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}
