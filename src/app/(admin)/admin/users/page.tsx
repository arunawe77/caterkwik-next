import { shortDate } from "@/lib/format";
import { utilityMetadata } from "@/lib/seo";
import { setUserRole } from "@/server/admin-actions";
import { db } from "@/server/db";
import { currentUser } from "@/server/session";

export const metadata = utilityMetadata("Users");

export default async function UsersPage() {
  const [me, users] = await Promise.all([currentUser(), db.user.findMany({ orderBy: { createdAt: "desc" }, take: 500 })]);

  return (
    <table className="table">
      <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th><th /></tr></thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td>{u.name}</td><td>{u.email}</td><td>{shortDate(u.createdAt)}</td>
            <td><span className={`tag ${u.role === "ADMIN" ? "PAID" : ""}`}>{u.role === "ADMIN" ? "Admin" : "Customer"}</span></td>
            <td>
              {u.id !== me?.id && (
                <form action={setUserRole} className="inline">
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="role" value={u.role === "ADMIN" ? "CUSTOMER" : "ADMIN"} />
                  <button className="btn btn-ghost btn-sm" type="submit">{u.role === "ADMIN" ? "Make customer" : "Make admin"}</button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
