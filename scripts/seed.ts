/** Creates the first administrator if no users exist. */
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";

async function main() {
  const count = await prisma.user.count();
  if (count > 0) {
    console.log(`Seed skipped: ${count} user(s) already exist.`);
    return;
  }
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 10) throw new Error("Set ADMIN_PASSWORD (min 10 characters) for the first admin user.");
  await prisma.user.create({
    data: {
      username,
      fullName: "System Administrator",
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
      mustChangePassword: true,
    },
  });
  console.log(`Created admin user "${username}". You will be asked to change the password on first login.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
