import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { AssistantDock } from "@/components/admin/assistant-dock";
import { logout } from "@/server/auth-actions";
import { currentUser, isAdmin } from "@/server/session";

// Staff only. The actions check again: this keeps the pages themselves private.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!isAdmin(user)) redirect("/account/login?next=/admin");

  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <Link href="/admin" className="adm-brand">Caterkwik<span>admin</span></Link>
        <AdminNav />
        <div className="adm-side-foot">
          <Link href="/" target="_blank">View shop</Link>
        </div>
      </aside>
      <div className="adm-col">
        <header className="adm-top">
          <form action="/admin/products" role="search" className="adm-search">
            <input type="search" name="q" placeholder="Search products by name, brand or code" aria-label="Search products" />
          </form>
          <div className="adm-user">
            <Link className="btn btn-navy btn-sm" href="/admin/products/new">+ Add product</Link>
            <span className="adm-avatar" aria-hidden>{user.name.trim().charAt(0).toUpperCase()}</span>
            <span className="adm-who"><b>{user.name}</b><small>{user.email}</small></span>
            <form action={logout}><button className="btn btn-ghost btn-sm" type="submit">Sign out</button></form>
          </div>
        </header>
        <div className="adm-main">{children}</div>
      </div>
      <AssistantDock configured={!!process.env.ANTHROPIC_API_KEY} />
    </div>
  );
}
