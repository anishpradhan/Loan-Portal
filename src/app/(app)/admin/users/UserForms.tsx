"use client";

import { useActionState, useState } from "react";
import type { Role } from "@prisma/client";
import { createUserAction, resetPasswordAction, updateUserAction, type AdminState } from "@/server/actions/admin";
import { Field, Select, SubmitButton } from "@/components/ui/form";

type Opt = { id: number; name: string };
const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  SENIOR: "Senior Management",
  PROVINCE_MANAGER: "Province Manager",
  BRANCH_MANAGER: "Branch Manager",
};

function TempPassword({ state }: { state: AdminState }) {
  if (state.error) return <p className="text-sm text-critical-text">{state.error}</p>;
  if (!state.ok) return null;
  return (
    <p className="text-sm text-good-text">
      {state.ok}
      {state.tempPassword && (
        <>
          {" "}Temporary password: <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-ink">{state.tempPassword}</code> — share it securely; it is shown only once.
        </>
      )}
    </p>
  );
}

function ScopeSelect({ role, branches, provinces, branchId, provinceId, form }: { role: Role; branches: Opt[]; provinces: Opt[]; branchId?: number | null; provinceId?: number | null; form?: string }) {
  if (role === "BRANCH_MANAGER")
    return (
      <select form={form} name="branchId" defaultValue={branchId ?? ""} aria-label="Branch" className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm">
        <option value="">Choose branch…</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    );
  if (role === "PROVINCE_MANAGER")
    return (
      <select form={form} name="provinceId" defaultValue={provinceId ?? ""} aria-label="Province" className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm">
        <option value="">Choose province…</option>
        {provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    );
  return <span className="text-sm text-muted">All branches</span>;
}

export function UserForm({ branches, provinces }: { branches: Opt[]; provinces: Opt[] }) {
  const [state, action] = useActionState<AdminState, FormData>(createUserAction, {});
  const [role, setRole] = useState<Role>("BRANCH_MANAGER");
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4 md:items-end">
        <Field label="Username" name="username" required pattern="[A-Za-z0-9._\-]{3,32}" />
        <Field label="Full name" name="fullName" required />
        <Select label="Role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <div>
          <span className="mb-1 block text-sm font-medium text-ink-2">Scope</span>
          <ScopeSelect role={role} branches={branches} provinces={provinces} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Create user</SubmitButton>
        <TempPassword state={state} />
      </div>
    </form>
  );
}

export function UserRow({
  user,
  branches,
  provinces,
  isMe,
}: {
  user: { id: number; username: string; fullName: string; role: Role; branchId: number | null; provinceId: number | null; active: boolean; lastLoginAt: string };
  branches: Opt[];
  provinces: Opt[];
  isMe: boolean;
}) {
  const [state, action] = useActionState<AdminState, FormData>(updateUserAction, {});
  const [resetState, resetAction] = useActionState<AdminState, FormData>(resetPasswordAction, {});
  const [role, setRole] = useState<Role>(user.role);
  const formId = `user-${user.id}`;
  return (
    <>
      <tr className={`border-t border-border ${user.active ? "" : "opacity-60"}`}>
        <td className="px-3 py-2 font-mono text-xs">
          {user.username}
          <input form={formId} type="hidden" name="username" value={user.username} />
          {isMe && <span className="ml-1 text-muted">(you)</span>}
        </td>
        <td className="px-3 py-2">
          <input form={formId} name="fullName" defaultValue={user.fullName} aria-label="Full name" className="w-44 rounded border border-border bg-surface px-2 py-1" />
        </td>
        <td className="px-3 py-2">
          <select form={formId} name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role" className="rounded border border-border bg-surface px-2 py-1.5">
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </td>
        <td className="px-3 py-2 min-w-52">
          <ScopeSelect form={formId} role={role} branches={branches} provinces={provinces} branchId={user.branchId} provinceId={user.provinceId} />
        </td>
        <td className="px-3 py-2">
          <input form={formId} type="checkbox" name="active" defaultChecked={user.active} aria-label="Active" />
        </td>
        <td className="px-3 py-2 text-xs text-muted">{user.lastLoginAt}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <form id={formId} action={action} className="inline">
            <input type="hidden" name="id" value={user.id} />
            <SubmitButton variant="secondary" className="!px-3 !py-1 text-xs" pendingText="Saving…">Save</SubmitButton>
          </form>
          <form action={resetAction} className="ml-2 inline" onSubmit={(e) => { if (!confirm(`Reset the password of ${user.username}?`)) e.preventDefault(); }}>
            <input type="hidden" name="id" value={user.id} />
            <button className="text-xs text-accent hover:underline">Reset password</button>
          </form>
        </td>
      </tr>
      {(state.ok || state.error || resetState.ok || resetState.error) && (
        <tr>
          <td colSpan={7} className="px-3 pb-2">
            <TempPassword state={resetState.ok || resetState.error ? resetState : state} />
          </td>
        </tr>
      )}
    </>
  );
}
