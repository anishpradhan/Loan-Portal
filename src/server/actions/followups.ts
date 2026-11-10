"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/auth/session";
import { accountWhere, scopeFor } from "@/server/auth/scope";
import type { FormState } from "@/server/auth/actions";

const schema = z.object({
  accountNumber: z.string().regex(/^\d{15}$/),
  note: z.string().trim().min(3, "Write a short note").max(2000),
  dueDate: z.string().optional(),
});

/** Any user may add follow-up notes, but only on accounts inside their scope. */
export async function addFollowUpAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const scope = await scopeFor(user);
  const account = await prisma.loanAccount.findFirst({
    where: { accountNumber: parsed.data.accountNumber, ...accountWhere(scope) },
  });
  if (!account) return { error: "Account not found in your branches." };
  const due = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  const f = await prisma.followUp.create({
    data: { accountId: account.id, note: parsed.data.note, dueDate: due && !Number.isNaN(due.getTime()) ? due : null, authorId: user.id },
  });
  await audit(user.id, "followup.add", "FollowUp", f.id, { accountNumber: parsed.data.accountNumber });
  revalidatePath(`/accounts/${parsed.data.accountNumber}`);
  return { ok: "Note added." };
}

export async function toggleFollowUpAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(form.get("id"));
  const scope = await scopeFor(user);
  const f = await prisma.followUp.findFirst({ where: { id, account: accountWhere(scope) }, include: { account: true } });
  if (!f) return;
  await prisma.followUp.update({ where: { id }, data: { done: !f.done } });
  await audit(user.id, "followup.toggle", "FollowUp", id, { done: !f.done });
  revalidatePath(`/accounts/${f.account.accountNumber}`);
}
