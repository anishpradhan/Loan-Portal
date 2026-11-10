"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { createSession, destroySession, requireUser } from "./session";

// Simple in-memory lockout: 5 failures in 15 minutes locks the username for 15 minutes.
const failures = new Map<string, { count: number; first: number }>();
const WINDOW = 15 * 60_000;

function isLocked(username: string) {
  const f = failures.get(username);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW) {
    failures.delete(username);
    return false;
  }
  return f.count >= 5;
}

function recordFailure(username: string) {
  const f = failures.get(username);
  if (!f || Date.now() - f.first > WINDOW) failures.set(username, { count: 1, first: Date.now() });
  else f.count++;
}

export interface FormState {
  error?: string;
  ok?: string;
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  if (!username || !password) return { error: "Enter your username and password." };
  if (isLocked(username)) return { error: "Too many failed attempts. Try again in 15 minutes." };

  const user = await prisma.user.findUnique({ where: { username } });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  const ip = (await headers()).get("x-forwarded-for") ?? null;
  if (!ok) {
    recordFailure(username);
    await audit(user?.id ?? null, "auth.login_failed", "user", username, { ip });
    return { error: "Invalid username or password." };
  }
  failures.delete(username);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  await audit(user.id, "auth.login", "user", user.id, { ip });
  redirect(user.mustChangePassword ? "/account/password" : next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .regex(/[A-Za-z]/, "Include a letter.")
  .regex(/[0-9]/, "Include a number.");

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser({ allowPasswordChange: true });
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await bcrypt.compare(current, user.passwordHash))) return { error: "Current password is incorrect." };
  if (next !== confirm) return { error: "New passwords do not match." };
  if (next === current) return { error: "Choose a password different from the current one." };
  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash: await bcrypt.hash(next, 12), mustChangePassword: false },
  });
  await audit(me.id, "auth.password_changed", "user", me.id);
  redirect("/");
}
