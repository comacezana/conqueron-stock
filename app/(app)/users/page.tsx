import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { setUserActive } from "@/app/actions";
import { PasswordForm, UserForm } from "@/components/AdminForms";
import { PageHead } from "@/components/ui";

export default async function UsersPage() {
  const me = await requireUser("admin");
  const users = await q<{ id: number; username: string; name: string; role: string; active: boolean }>("SELECT id,username,name,role,active FROM users ORDER BY role, name");
  return (
    <>
      <PageHead title="Users" desc="Two roles only: Admin and Store. Deactivating a user keeps their history intact." />
      <div className="tablewrap" style={{ marginBottom: 36 }}>
        <table className="t stack">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Password</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="pname">{u.name}{u.id === me.id && <span className="tag" style={{ marginLeft: 8 }}>You</span>}</td>
                <td className="mono">{u.username}</td>
                <td style={{ textTransform: "capitalize" }}>{u.role}</td>
                <td><span className={`badge ${u.active ? "in" : "unset"}`}>{u.active ? "ACTIVE" : "INACTIVE"}</span></td>
                <td className="hide-s"><PasswordForm id={u.id} /></td>
                <td className="actcell">
                  {u.id !== me.id && <form action={setUserActive.bind(null, u.id, !u.active)}><button className={`btn sm${u.active ? " danger" : ""}`}>{u.active ? "Deactivate" : "Activate"}</button></form>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sec-h"><h2 style={{ font: "inherit" }}>Add user</h2></div>
      <UserForm />
    </>
  );
}
