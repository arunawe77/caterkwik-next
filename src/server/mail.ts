import nodemailer from "nodemailer";

export interface Mail {
  to: string | string[];
  subject: string;
  text: string;
  replyTo?: string;
}

// With SMTP_URL set, mail goes out over SMTP. Without it (local development, tests) it is written
// to the log and kept in `outbox`, so every flow can be seen working before a mail server exists.
export const outbox: Mail[] = [];

const FROM = () => process.env.MAIL_FROM ?? "Caterkwik <no-reply@caterkwik.co.uk>";
export const SALES_EMAIL = () => process.env.SALES_EMAIL ?? "sales@caterkwik.co.uk";

// Sending is best effort: a mail outage must never lose an order or an enquiry that is already saved.
export async function sendMail(mail: Mail): Promise<boolean> {
  const url = process.env.SMTP_URL;
  try {
    if (!url) {
      outbox.push(mail);
      if (outbox.length > 50) outbox.shift();
      console.log(`[mail] to ${[mail.to].flat().join(", ")}: ${mail.subject}`);
      return true;
    }
    await nodemailer.createTransport(url).sendMail({ from: FROM(), ...mail });
    return true;
  } catch (err) {
    console.error("[mail] could not send:", err instanceof Error ? err.message : err);
    return false;
  }
}
