import { redirect } from "next/navigation";
import { getSettings, getUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  const s = await getSettings();
  return (
    <div className="login">
      <section className="art">
        <div className="brand">
          <span className="mark" aria-hidden="true">{s.company.trim()[0]?.toUpperCase() ?? "C"}</span>
          <div><b>{s.company}</b><span>Stock ledger</span></div>
        </div>
        <div>
          <h2>What is in stock, and why it changed.</h2>
          <p>Every product, every movement, and who recorded it.</p>
        </div>
      </section>
      <section className="formside">
        <div className="box">
          <div>
            <h1>Sign in</h1>
            <p className="dim">Use the account your Admin gave you.</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </div>
  );
}
