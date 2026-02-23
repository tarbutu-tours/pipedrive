import bcrypt from "bcryptjs";
import type { Db } from "../db/index.js";

export type Role = "admin" | "sales_manager" | "sales_rep" | "viewer";

export interface UserRecord {
  id: string;
  email: string;
  role: string;
}

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRecord | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, role: true, passwordHash: true },
  });
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role };
}

export async function findUserById(db: Db, id: string): Promise<UserRecord | null> {
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });
  return user;
}

export async function createUser(
  db: Db,
  email: string,
  password: string,
  role: Role = "sales_rep"
): Promise<UserRecord> {
  const hashed = await hashPassword(password);
  const user = await db.user.create({
    data: {
      email: email.trim().toLowerCase(),
      passwordHash: hashed,
      role,
    },
    select: { id: true, email: true, role: true },
  });
  return user;
}

/** Reset password for a user by email. Returns the user or null. */
export async function resetPassword(
  db: Db,
  email: string,
  newPassword: string
): Promise<UserRecord | null> {
  const hashed = await hashPassword(newPassword);
  const normalized = email.trim().toLowerCase();
  const existing = await db.user.findUnique({
    where: { email: normalized },
    select: { id: true },
  });
  if (!existing) {
    const anyMatch = await db.user.findMany({ take: 20, select: { id: true, email: true } });
    const match = anyMatch.find((u) => u.email.toLowerCase() === normalized);
    if (!match) return null;
    await db.user.update({
      where: { id: match.id },
      data: { passwordHash: hashed },
    });
    const u = await db.user.findUnique({
      where: { id: match.id },
      select: { id: true, email: true, role: true },
    });
    return u;
  }
  await db.user.update({
    where: { id: existing.id },
    data: { passwordHash: hashed },
  });
  const updated = await db.user.findUnique({
    where: { id: existing.id },
    select: { id: true, email: true, role: true },
  });
  return updated;
}

export async function authenticate(
  db: Db,
  email: string,
  password: string
): Promise<{ user: UserRecord } | { error: string }> {
  try {
    const userRow = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!userRow || !userRow.passwordHash) {
      return { error: "Invalid email or password" };
    }
    const valid = await verifyPassword(password, userRow.passwordHash);
    if (!valid) return { error: "Invalid email or password" };
    return {
      user: { id: userRow.id, email: userRow.email, role: userRow.role },
    };
  } catch {
    return { error: "Invalid email or password" };
  }
}

/** Can this role confirm actions (any user's request)? */
export function canConfirmActions(role: string): boolean {
  return role === "admin" || role === "sales_manager";
}

/** Can this user confirm this specific action request (own request as sales_rep, or manager/admin for any)? */
export function canConfirmThisRequest(
  userRole: string,
  userId: string,
  requestCreatedByUserId: string
): boolean {
  if (canConfirmActions(userRole)) return true;
  if (userRole === "sales_rep" && userId === requestCreatedByUserId) return true;
  return false;
}

/** Can this role request write actions (and get confirmation flow)? */
export function canRequestActions(role: string): boolean {
  return ["admin", "sales_manager", "sales_rep"].includes(role);
}

/** Can this role use chat (read-only at least)? */
export function canUseChat(role: string): boolean {
  return true;
}
