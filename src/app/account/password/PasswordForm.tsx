"use client";

import { useActionState } from "react";
import { changePasswordAction, type FormState } from "@/server/auth/actions";
import { Field, SubmitButton } from "@/components/ui/form";

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
      <Field label="New password" name="next" type="password" autoComplete="new-password" required hint="At least 10 characters, with a letter and a number." />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      {state.error && <p role="alert" className="text-sm text-critical-text">{state.error}</p>}
      <SubmitButton className="w-full">Update password</SubmitButton>
    </form>
  );
}
