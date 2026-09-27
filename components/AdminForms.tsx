"use client";

import { useActionState } from "react";
import { createUser, resetPassword, saveCategory, saveSettings, type FormState } from "@/app/actions";

function Msg({ s }: { s: FormState }) {
  return s.error ? <div className="err" role="alert">{s.error}</div> : s.ok ? <div className="okmsg" role="status">{s.ok}</div> : null;
}

export function CategoryForm({ id, name }: { id?: number; name?: string }) {
  const [s, a, p] = useActionState<FormState, FormData>(saveCategory, {});
  return (
    <form action={a} style={{ display: "grid", gap: 8 }}>
      {id && <input type="hidden" name="id" value={id} />}
      <div style={{ display: "flex", gap: 8 }}>
        <label className="sr" htmlFor={`cn-${id ?? "new"}`}>Category name</label>
        <input id={`cn-${id ?? "new"}`} name="name" className="input" defaultValue={name} placeholder="New category name" required />
        <button className={`btn ${id ? "sm" : "primary"}`} disabled={p}>{id ? "Rename" : "Add"}</button>
      </div>
      <Msg s={s} />
    </form>
  );
}

export function UserForm() {
  const [s, a, p] = useActionState<FormState, FormData>(createUser, {});
  return (
    <form action={a} className="form">
      <div className="grid2">
        <div className="field"><label htmlFor="u-name">Full name</label><input id="u-name" name="name" className="input" required /></div>
        <div className="field"><label htmlFor="u-user">Username</label><input id="u-user" name="username" className="input" autoComplete="off" required /></div>
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="u-role">Role</label>
          <select id="u-role" name="role" className="input" defaultValue="store"><option value="store">Store</option><option value="admin">Admin</option></select>
        </div>
        <div className="field"><label htmlFor="u-pw">Password</label><input id="u-pw" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required /><span className="hint">At least 8 characters.</span></div>
      </div>
      <Msg s={s} />
      <div><button className="btn primary" disabled={p}>Create user</button></div>
    </form>
  );
}

export function PasswordForm({ id }: { id: number }) {
  const [s, a, p] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={a} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="id" value={id} />
      <label className="sr" htmlFor={`pw-${id}`}>New password</label>
      <input id={`pw-${id}`} name="password" type="password" className="input" style={{ width: 170, minHeight: 32 }} placeholder="New password" minLength={8} autoComplete="new-password" required />
      <button className="btn sm" disabled={p}>Set</button>
      {s.ok && <span className="pos">Saved</span>}{s.error && <span className="neg">{s.error}</span>}
    </form>
  );
}

export function SettingsForm({ v }: { v: { company: string; currency: string; timezone: string; storeCanDamage: boolean } }) {
  const [s, a, p] = useActionState<FormState, FormData>(saveSettings, {});
  return (
    <form action={a} className="form">
      <div className="field"><label htmlFor="company_name">Company name</label><input id="company_name" name="company_name" className="input" defaultValue={v.company} required /></div>
      <div className="grid2">
        <div className="field"><label htmlFor="currency">Currency label</label><input id="currency" name="currency" className="input" defaultValue={v.currency} maxLength={6} required /><span className="hint">Shown next to sale and return amounts. No conversion.</span></div>
        <div className="field"><label htmlFor="timezone">Timezone</label><input id="timezone" name="timezone" className="input" defaultValue={v.timezone} required /><span className="hint">IANA name, e.g. Africa/Addis_Ababa.</span></div>
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <input type="checkbox" name="store_can_damage" defaultChecked={v.storeCanDamage} style={{ marginTop: 3, width: 18, height: 18 }} />
        <span><b style={{ fontWeight: 600 }}>Store users can record Damage</b><br /><span className="hint">Off by default. Returns always stay Admin only.</span></span>
      </label>
      <Msg s={s} />
      <div><button className="btn primary" disabled={p}>Save settings</button></div>
    </form>
  );
}
