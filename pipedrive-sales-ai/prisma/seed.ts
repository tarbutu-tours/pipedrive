import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config({ path: path.join(projectRoot, ".env.local"), override: true });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_EMAIL = "admin@local.dev";
const DEFAULT_PASSWORD = "Admin123!";
const DEFAULT_ROLE = "admin";

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: DEFAULT_EMAIL },
  });
  if (existing) {
    console.log("משתמש ברירת מחדל כבר קיים:", DEFAULT_EMAIL);
    return;
  }
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  await prisma.user.create({
    data: {
      email: DEFAULT_EMAIL,
      passwordHash,
      role: DEFAULT_ROLE,
    },
  });
  console.log("נוצר משתמש ברירת מחדל:");
  console.log("  אימייל:", DEFAULT_EMAIL);
  console.log("  סיסמה:", DEFAULT_PASSWORD);
  console.log("  תפקיד:", DEFAULT_ROLE);
  console.log("  (אפשר להתחבר ב-/login ואז לשנות סיסמה אם תרצה)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
