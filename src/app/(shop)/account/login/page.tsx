import Link from "next/link";
import { ActionForm, Field } from "@/components/forms";
import { safePath } from "@/server/request";
import { login } from "@/server/auth-actions";
import { utilityMetadata } from "@/lib/seo";

export const metadata = utilityMetadata("Sign in");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  return (
    <main className="wrap ovenpage narrow">
      <header className="ohead"><h1>Sign in</h1></header>
      {reset && <p className="okmsg">Your password has been changed. Sign in with the new one.</p>}
      <ActionForm action={login} submit="Sign in">
        <input type="hidden" name="next" value={safePath(next, "")} />
        <Field name="email" label="Email" type="email" required autoComplete="email" />
        <Field name="password" label="Password" type="password" required autoComplete="current-password" />
      </ActionForm>
      <p><Link href="/account/forgot">Forgotten your password?</Link></p>
      <p>New here? <Link href={`/account/register${next ? `?next=${encodeURIComponent(safePath(next, ""))}` : ""}`}>Create an account</Link></p>
    </main>
  );
}
