import { ActionForm, Field } from "@/components/forms";
import { utilityMetadata } from "@/lib/seo";
import { resetPassword } from "@/server/auth-actions";

export const metadata = utilityMetadata("Choose a new password");

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="wrap ovenpage narrow">
      <header className="ohead"><h1>Choose a new password</h1></header>
      <ActionForm action={resetPassword} submit="Change password">
        <input type="hidden" name="token" value={token} />
        <Field name="password" label="New password" type="password" required autoComplete="new-password" hint="At least 10 characters." />
      </ActionForm>
    </main>
  );
}
