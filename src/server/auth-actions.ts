"use server";

import { redirect } from "next/navigation";
import { digest, hashPassword, newToken, verifyPassword } from "@/server/crypto";
import { db } from "@/server/db";
import { passwordReset } from "@/server/emails";
import { sendMail } from "@/server/mail";
import { clientIp, limits, safePath, type FormState } from "@/server/request";
import { firstError, loginSchema, registerSchema, resetRequestSchema, resetSchema } from "@/server/schemas";
import { endSession, startSession } from "@/server/session";

const ONE_HOUR = 60 * 60 * 1000;

export async function register(_: FormState, form: FormData): Promise<FormState> {
  if (limits.register(await clientIp())) return { error: "Too many attempts. Try again later." };
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };

  const { name, email, password } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with that email already exists. Sign in instead." };

  const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  // Orders placed as a guest with this email now belong to the new account.
  await db.order.updateMany({ where: { email, userId: null }, data: { userId: user.id } });
  await startSession(user.id);
  redirect(safePath(form.get("next"), "/account"));
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  if (limits.login(await clientIp())) return { error: "Too many attempts. Try again in a few minutes." };
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // The same answer for an unknown email and a wrong password, so the form cannot be used to find accounts.
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) return { error: "That email and password do not match." };

  await startSession(user.id);
  redirect(safePath(form.get("next"), user.role === "ADMIN" ? "/admin" : "/account"));
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/");
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  if (limits.reset(await clientIp())) return { error: "Too many attempts. Try again later." };
  const parsed = resetRequestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    const token = newToken();
    await db.passwordReset.create({ data: { userId: user.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + ONE_HOUR) } });
    await sendMail({ to: user.email, ...passwordReset(user.name, token) });
  }
  // Said whether or not the account exists.
  return { ok: true };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstError(parsed.error) };

  const reset = await db.passwordReset.findUnique({ where: { tokenHash: digest(parsed.data.token) } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return { error: "This link has expired. Ask for a new one." };

  await db.$transaction([
    db.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(parsed.data.password) } }),
    db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    // Anyone signed in with the old password is signed out.
    db.session.deleteMany({ where: { userId: reset.userId } }),
  ]);
  redirect("/account/login?reset=1");
}
