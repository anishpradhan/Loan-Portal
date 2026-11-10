"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/server/auth/actions";
import { Field, SubmitButton } from "@/components/ui/form";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Username" name="username" autoComplete="username" autoFocus required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      {state.error && (
        <p role="alert" className="text-sm text-critical-text">
          {state.error}
        </p>
      )}
      <SubmitButton className="w-full">Sign in</SubmitButton>
    </form>
  );
}
