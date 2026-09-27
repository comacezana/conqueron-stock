import { redirect } from "next/navigation";
import { getSettings, getUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

const SAMPLE = [
  ["09:15", "E1-PV5-110", "+500", "p"],
  ["10:42", "E1-PV5-110", "−100", "m"],
  ["11:03", "T1-PV4-110(W)", "+250", "p"],
  ["14:20", "E3-PV5-50", "−10", "m"],
];

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  const s = await getSettings();
  return (
    <div className="login">
      <section className="art" aria-hidden="true">
        <b>{s.company}</b>
        <div>
          <h2>What is in stock, and why it changed.</h2>
          <p>One ledger for every product, every movement, and who recorded it.</p>
        </div>
        <div className="ledger">
          {SAMPLE.map(([t, sku, q, c]) => (
            <div key={t + sku}><span>{t}</span><span>{sku}</span><span className={c}>{q}</span></div>
          ))}
        </div>
      </section>
      <section className="formside">
        <div className="box">
          <div><h1>Sign in</h1><p className="dim">Use the account issued by your Admin.</p></div>
          <LoginForm />
        </div>
      </section>
    </div>
  );
}
