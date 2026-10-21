import Link from "next/link";
import { ActionForm, Field } from "@/components/forms";
import { utilityMetadata } from "@/lib/seo";
import { register } from "@/server/auth-actions";
import { safePath } from "@/server/request";

export const metadata = utilityMetadata("Create an account");

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="wrap ovenpage narrow">
      <header className="ohead">
        <h1>Create an account</h1>
        <p className="sub">See your orders and quotes in one place. You can also order without an account.</p>
      </header>
      <ActionForm action={register} submit="Create account">
        <input type="hidden" name="next" value={safePath(next, "")} />
        <Field name="name" label="Your name" required autoComplete="name" />
        <Field name="email" label="Email" type="email" required autoComplete="email" />
        <Field name="password" label="Password" type="password" required autoComplete="new-password" hint="At least 10 characters." />
      </ActionForm>
      <p>Already have one? <Link href="/account/login">Sign in</Link></p>
    </main>
  );
}
