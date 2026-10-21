import { PrismaClient } from "@prisma/client";

// One client per process. In development, Next reloads modules, so it is kept on globalThis.
const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForDb.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForDb.prisma = db;
