"use client";

import { useActionState, useEffect, useRef } from "react";
import { addFollowUpAction } from "@/server/actions/followups";
import type { FormState } from "@/server/auth/actions";
import { SubmitButton } from "@/components/ui/form";

export function FollowUpForm({ accountNumber }: { accountNumber: string }) {
  const [state, action] = useActionState<FormState, FormData>(addFollowUpAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="accountNumber" value={accountNumber} />
      <textarea
        name="note"
        required
        minLength={3}
        rows={2}
        placeholder="e.g. Visited borrower; promised to pay overdue interest by next week"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        aria-label="Follow-up note"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted">
          Due <input type="date" name="dueDate" className="ml-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink" />
        </label>
        <SubmitButton className="ml-auto">Add note</SubmitButton>
      </div>
      {(state.error || state.ok) && <p className={`text-sm ${state.error ? "text-critical-text" : "text-good-text"}`}>{state.error ?? state.ok}</p>}
    </form>
  );
}
