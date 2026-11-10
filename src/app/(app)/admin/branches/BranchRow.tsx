"use client";

import { useActionState } from "react";
import { updateBranchAction, type AdminState } from "@/server/actions/admin";
import { SubmitButton } from "@/components/ui/form";

export function BranchRow(props: { id: number; name: string; accounts: number; users: number; province: string; email: string }) {
  const [state, action] = useActionState<AdminState, FormData>(updateBranchAction, {});
  const formId = `branch-${props.id}`;
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium">{props.name}</td>
      <td className="px-3 py-2 num">{props.accounts.toLocaleString("en-IN")}</td>
      <td className="px-3 py-2 num">{props.users}</td>
      <td className="px-3 py-2">
        <input form={formId} name="province" list="provinces" defaultValue={props.province} aria-label={`Province of ${props.name}`} className="w-52 rounded border border-border bg-surface px-2 py-1" />
      </td>
      <td className="px-3 py-2">
        <input form={formId} name="email" type="email" defaultValue={props.email} aria-label={`Email of ${props.name}`} className="w-56 rounded border border-border bg-surface px-2 py-1" />
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <form id={formId} action={action} className="inline">
          <input type="hidden" name="id" value={props.id} />
          <SubmitButton variant="secondary" className="!px-3 !py-1 text-xs" pendingText="Saving…">Save</SubmitButton>
        </form>
        {state.ok && <span className="ml-2 text-xs text-good-text">✓</span>}
        {state.error && <span className="ml-2 text-xs text-critical-text">{state.error}</span>}
      </td>
    </tr>
  );
}
