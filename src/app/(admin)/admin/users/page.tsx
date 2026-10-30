import { Pager } from "@/components/admin/pager";
import { shortDate } from "@/lib/format";
import { pageOf } from "@/lib/paging";
import { utilityMetadata } from "@/lib/seo";
import { setUserRole } from "@/server/admin-actions";
import { db } from "@/server/db";
import { currentUser } from "@/server/session";

export const metadata = utilityMetadata("Users");

const PAGE = 50;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page, skip, take } = pageOf((await searchParams).page, PAGE);
  const [me, users, total] = await Promise.all([currentUser(), db.user.findMany({ orderBy: { createdAt: "desc" }, skip, take }), db.user.count()]);

  return (
    <>
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
    <Pager path="/admin/users" query={{}} page={page} size={PAGE} total={total} />
    </>
  );
}
