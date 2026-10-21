"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canMove } from "@/lib/orderflow";
import { db } from "@/server/db";
import { orderShipped } from "@/server/emails";
import { sendMail } from "@/server/mail";
import { clearRedirectCache } from "@/server/redirects";
import { currentUser, isAdmin } from "@/server/session";

// Every action here is open to staff only. The admin pages check too, but the action is the
// real gate: a form can be posted by anyone.
async function requireAdmin() {
  const user = await currentUser();
  if (!isAdmin(user)) redirect("/account/login?next=/admin");
  return user as NonNullable<typeof user>;
}

const id = z.string().min(1).max(60);
const note = z.string().trim().max(1000).transform((v) => v || null);

const statusSchema = z.object({
  id,
  status: z.enum(["AWAITING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "COMPLETED", "CANCELLED"]),
  trackingNote: note.optional(),
});

export async function setOrderStatus(form: FormData): Promise<void> {
  await requireAdmin();
  const parsed = statusSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;

  const order = await db.order.findUnique({ where: { id: parsed.data.id }, include: { lines: true } });
  if (!order || !canMove(order.status, parsed.data.status)) return;

  const updated = await db.order.update({
    where: { id: order.id },
    data: {
      status: parsed.data.status,
      trackingNote: parsed.data.trackingNote ?? order.trackingNote,
      ...(parsed.data.status === "PAID" && { paidAt: new Date() }),
    },
  });
  if (updated.status === "SHIPPED") await sendMail({ to: updated.email, ...orderShipped({ ...updated, lines: order.lines }) });
  revalidatePath("/admin/orders");
  redirect(`/admin/orders/${order.id}`);
}

const enquirySchema = z.object({ id, status: z.enum(["NEW", "IN_PROGRESS", "DONE"]), notes: note.optional() });

export async function setEnquiryStatus(form: FormData): Promise<void> {
  await requireAdmin();
  const parsed = enquirySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  await db.enquiry.updateMany({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status, ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }) },
  });
  revalidatePath("/admin/enquiries");
  redirect("/admin/enquiries");
}

const path = z.string().trim().max(300).regex(/^\/(?![/\\])/, "Start with a /");
const redirectSchema = z.object({ fromPath: path, toPath: path }).refine((r) => r.fromPath !== r.toPath, "A redirect cannot point at itself");

export async function addRedirect(_: unknown, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await requireAdmin();
  const parsed = redirectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.customRedirect.upsert({ where: { fromPath: parsed.data.fromPath }, create: parsed.data, update: { toPath: parsed.data.toPath } });
  clearRedirectCache();
  revalidatePath("/admin/redirects");
  return { ok: true };
}

export async function deleteRedirect(form: FormData): Promise<void> {
  await requireAdmin();
  await db.customRedirect.deleteMany({ where: { id: String(form.get("id") ?? "") } });
  clearRedirectCache();
  revalidatePath("/admin/redirects");
  redirect("/admin/redirects");
}

const roleSchema = z.object({ id, role: z.enum(["CUSTOMER", "ADMIN"]) });

export async function setUserRole(form: FormData): Promise<void> {
  const me = await requireAdmin();
  const parsed = roleSchema.safeParse(Object.fromEntries(form));
  // Staff cannot demote themselves, so the last admin can never lock everyone out.
  if (!parsed.success || parsed.data.id === me.id) return;
  await db.user.updateMany({ where: { id: parsed.data.id }, data: { role: parsed.data.role } });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}
