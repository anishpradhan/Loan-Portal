import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { prisma } from "@/server/db";
import { SESSION_COOKIE, signSession, verifySession, SESSION_HOURS } from "./token";

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  branchId: number | null;
  provinceId: number | null;
  mustChangePassword: boolean;
}

export async function createSession(userId: number): Promise<void> {
  const token = await signSession({ uid: userId });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Current user, re-read from the DB each request so deactivation is immediate. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySession(token);
  if (!payload) return null;
  const u = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!u || !u.active) return null;
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    branchId: u.branchId,
    provinceId: u.provinceId,
    mustChangePassword: u.mustChangePassword,
  };
});

export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (u.mustChangePassword && !opts.allowPasswordChange) redirect("/account/password");
  return u;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const u = await requireUser();
  if (!roles.includes(u.role)) redirect("/?denied=1");
  return u;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  SENIOR: "Senior Management",
  PROVINCE_MANAGER: "Province Manager",
  BRANCH_MANAGER: "Branch Manager",
};
