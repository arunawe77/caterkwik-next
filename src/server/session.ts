import { cookies } from "next/headers";
import type { Role, User } from "@prisma/client";
import { digest, newToken } from "@/server/crypto";
import { db } from "@/server/db";

const COOKIE = "ck_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

export async function startSession(userId: string): Promise<void> {
  const token = newToken();
  await db.session.create({ data: { id: digest(token), userId, expiresAt: new Date(Date.now() + THIRTY_DAYS * 1000) } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: THIRTY_DAYS, secure: process.env.NODE_ENV === "production",
  });
}

// The signed-in user, or null. An expired session is deleted on sight.
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } });
    return null;
  }
  return session.user;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: digest(token) } });
  jar.delete(COOKIE);
}

export const isAdmin = (user: { role: Role } | null): user is { role: "ADMIN" } => user?.role === "ADMIN";
