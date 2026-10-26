import { db } from "@/server/db";

// Stand-ins for the parts of Next that only exist inside a request: the cookie jar, the request
// headers, revalidation and redirects. Server code is otherwise exercised for real.

export const jar = new Map<string, string>();
export const requestHeaders = new Map<string, string>();
export const revalidated: string[] = [];

export const headersMock = {
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => ({ get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null }),
};

export const cacheMock = { revalidatePath: (path: string) => void revalidated.push(path) };

// redirect() throws; this returns where it was heading, or null if the call did not redirect.
export async function redirectedTo(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw e;
    return digest.split(";")[2];
  }
}

export const form = (fields: Record<string, string | undefined>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) data.set(k, v);
  return data;
};

export async function resetTestState() {
  jar.clear();
  requestHeaders.clear();
  revalidated.length = 0;
  await db.$transaction([
    db.webhookEvent.deleteMany(), db.orderLine.deleteMany(), db.order.deleteMany(), db.enquiry.deleteMany(),
    db.passwordReset.deleteMany(), db.session.deleteMany(), db.customRedirect.deleteMany(), db.user.deleteMany(),
    db.pendingAction.deleteMany(), db.auditLog.deleteMany(), db.importRun.deleteMany(), db.product.deleteMany(), db.category.deleteMany(), db.competitor.deleteMany(), db.supplier.deleteMany(),
  ]);
}
