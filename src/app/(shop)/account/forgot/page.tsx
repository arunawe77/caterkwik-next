import { ActionForm, Field } from "@/components/forms";
import { utilityMetadata } from "@/lib/seo";
import { requestPasswordReset } from "@/server/auth-actions";

export const metadata = utilityMetadata("Reset your password");

export default function ForgotPage() {
  return (
    <main className="wrap ovenpage narrow">
      <header className="ohead">
        <h1>Reset your password</h1>
        <p className="sub">Enter your email and, if there is an account, we will send a link to choose a new password.</p>
      </header>
      <ActionForm action={requestPasswordReset} submit="Send the link" success="If there is an account with that email, a link is on its way. It expires in one hour.">
        <Field name="email" label="Email" type="email" required autoComplete="email" />
      </ActionForm>
    </main>
  );
}
