// Makes an existing account an admin. The first admin has to be made here, because the admin
// pages are for staff only and nobody is staff yet.
//
//   node scripts/make-admin.mjs someone@caterkwik.co.uk
//
// The person registers on the site first, then this promotes them.

import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email>");
  process.exit(1);
}

const db = new PrismaClient();
try {
  const { count } = await db.user.updateMany({ where: { email }, data: { role: "ADMIN" } });
  if (!count) {
    console.error(`No account for ${email}. Register on the site first.`);
    process.exit(1);
  }
  console.log(`${email} is now an admin.`);
} finally {
  await db.$disconnect();
}
