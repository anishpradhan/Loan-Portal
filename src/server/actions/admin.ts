"use server";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth/session";
import { invalidateSnapshotCache } from "@/server/repo/positions";

export interface AdminState {
  error?: string;
  ok?: string;
  tempPassword?: string;
}

function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += alphabet[randomInt(alphabet.length)];
  return s.slice(0, 11) + String(randomInt(10)); // always contains a digit
}

// ---------- snapshots ----------

export async function deleteSnapshotAction(form: FormData): Promise<void> {
  const admin = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const s = await prisma.snapshot.delete({ where: { id } });
  await audit(admin.id, "snapshot.delete", "Snapshot", id, { asOf: s.asOf, rows: s.rowCount });
  invalidateSnapshotCache();
  revalidatePath("/", "layout");
}

// ---------- branches & products ----------

const branchSchema = z.object({
  id: z.coerce.number().int(),
  province: z.string().trim().max(80),
  email: z.union([z.literal(""), z.string().trim().email()]),
});

export async function updateBranchAction(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireRole("ADMIN");
  const parsed = branchSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, province, email } = parsed.data;
  const provinceId = province ? (await prisma.province.upsert({ where: { name: province }, update: {}, create: { name: province } })).id : null;
  await prisma.branch.update({ where: { id }, data: { provinceId, email: email || null } });
  await audit(admin.id, "branch.update", "Branch", id, { province, email });
  invalidateSnapshotCache();
  revalidatePath("/admin/branches");
  return { ok: "Saved" };
}

export async function toggleProductExclusionAction(form: FormData): Promise<void> {
  const admin = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const p = await prisma.product.findUniqueOrThrow({ where: { id } });
  await prisma.product.update({ where: { id }, data: { excludeFromProvisioning: !p.excludeFromProvisioning } });
  await audit(admin.id, "product.toggle_exclusion", "Product", id, { name: p.name, exclude: !p.excludeFromProvisioning });
  invalidateSnapshotCache();
  revalidatePath("/", "layout");
}

// ---------- users ----------

const ROLES = ["ADMIN", "SENIOR", "PROVINCE_MANAGER", "BRANCH_MANAGER"] as const;

const userSchema = z
  .object({
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "Username: 3–32 letters, digits, dot, dash or underscore"),
    fullName: z.string().trim().min(2, "Enter the full name"),
    role: z.enum(ROLES),
    branchId: z.coerce.number().int().optional().or(z.literal("").transform(() => undefined)),
    provinceId: z.coerce.number().int().optional().or(z.literal("").transform(() => undefined)),
  })
  .refine((u) => u.role !== "BRANCH_MANAGER" || u.branchId, { message: "Choose the branch for a branch manager", path: ["branchId"] })
  .refine((u) => u.role !== "PROVINCE_MANAGER" || u.provinceId, { message: "Choose the province for a province manager", path: ["provinceId"] });

function scopeFields(role: Role, branchId?: number, provinceId?: number) {
  return {
    branchId: role === "BRANCH_MANAGER" ? (branchId ?? null) : null,
    provinceId: role === "PROVINCE_MANAGER" ? (provinceId ?? null) : null,
  };
}

export async function createUserAction(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireRole("ADMIN");
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (await prisma.user.findUnique({ where: { username: d.username } })) return { error: "That username is taken." };
  const pw = tempPassword();
  const u = await prisma.user.create({
    data: {
      username: d.username,
      fullName: d.fullName,
      role: d.role,
      ...scopeFields(d.role, d.branchId, d.provinceId),
      passwordHash: await bcrypt.hash(pw, 12),
      mustChangePassword: true,
    },
  });
  await audit(admin.id, "user.create", "User", u.id, { username: d.username, role: d.role });
  revalidatePath("/admin/users");
  return { ok: `Created ${d.username}.`, tempPassword: pw };
}

export async function updateUserAction(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const active = form.get("active") === "on";
  if (id === admin.id && (!active || d.role !== "ADMIN")) return { error: "You cannot deactivate or demote your own account." };
  await prisma.user.update({
    where: { id },
    data: { fullName: d.fullName, role: d.role, active, ...scopeFields(d.role, d.branchId, d.provinceId) },
  });
  await audit(admin.id, "user.update", "User", id, { role: d.role, active, branchId: d.branchId, provinceId: d.provinceId });
  revalidatePath("/admin/users");
  return { ok: "Saved." };
}

export async function resetPasswordAction(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireRole("ADMIN");
  const id = Number(form.get("id"));
  const pw = tempPassword();
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(pw, 12), mustChangePassword: true } });
  await audit(admin.id, "user.reset_password", "User", id);
  return { ok: "Password reset.", tempPassword: pw };
}
