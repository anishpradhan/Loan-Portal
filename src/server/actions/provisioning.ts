"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth/session";
import type { FormState } from "@/server/auth/actions";

const overrideSchema = z.object({
  accountNumber: z.string().regex(/^\d{15}$/, "Account number must be 15 digits"),
  amount: z.coerce.number().positive("Amount must be positive"),
  reason: z.string().trim().min(5, "Give a reason (at least 5 characters)"),
  effectiveFrom: z.coerce.date(),
});

/** Manual additional provision ("Add: LLP"), approved by admin or senior management. */
export async function addOverrideAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireRole("ADMIN", "SENIOR");
  const parsed = overrideSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const account = await prisma.loanAccount.findUnique({ where: { accountNumber: parsed.data.accountNumber } });
  if (!account) return { error: "Account not found." };
  const o = await prisma.provisionOverride.create({
    data: {
      accountId: account.id,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      effectiveFrom: parsed.data.effectiveFrom,
      createdById: user.id,
    },
  });
  await audit(user.id, "provision.override_add", "ProvisionOverride", o.id, parsed.data);
  revalidatePath("/provisioning");
  return { ok: "Additional provision recorded." };
}

export async function endOverrideAction(form: FormData): Promise<void> {
  const user = await requireRole("ADMIN", "SENIOR");
  const id = Number(form.get("id"));
  await prisma.provisionOverride.update({ where: { id }, data: { effectiveTo: new Date() } });
  await audit(user.id, "provision.override_end", "ProvisionOverride", id);
  revalidatePath("/provisioning");
}
