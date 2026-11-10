"use client";

import { useActionState } from "react";
import { addOverrideAction } from "@/server/actions/provisioning";
import type { FormState } from "@/server/auth/actions";
import { Field, SubmitButton } from "@/components/ui/form";

export function OverrideForm({ defaultDate }: { defaultDate: string }) {
  const [state, action] = useActionState<FormState, FormData>(addOverrideAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_2fr_1fr_auto] lg:items-end">
      <Field label="Account number" name="accountNumber" required pattern="\d{15}" inputMode="numeric" />
      <Field label="Additional provision (Rs.)" name="amount" type="number" step="0.01" min="0.01" required />
      <Field label="Reason" name="reason" required minLength={5} />
      <Field label="Effective from" name="effectiveFrom" type="date" defaultValue={defaultDate} required />
      <SubmitButton>Add</SubmitButton>
      {(state.error || state.ok) && (
        <p role="status" className={`sm:col-span-2 lg:col-span-5 text-sm ${state.error ? "text-critical-text" : "text-good-text"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
