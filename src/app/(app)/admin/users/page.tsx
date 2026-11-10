import { Card, PageHeader } from "@/components/ui/primitives";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/session";
import { UserForm, UserRow } from "./UserForms";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireRole("ADMIN");
  const [users, branches, provinces] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { username: "asc" }] }),
    prisma.branch.findMany({ orderBy: { code: "asc" }, select: { id: true, name: true } }),
    prisma.province.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const opts = { branches, provinces };
  return (
    <>
      <PageHeader title="Users" subtitle="Branch managers see only their branch; province managers see their province's branches." />
      <Card title="Add user" subtitle="A temporary password is generated and must be changed at first sign-in.">
        <UserForm {...opts} />
      </Card>
      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Full name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Branch / Province</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Last sign-in</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                {...opts}
                isMe={u.id === me.id}
                user={{
                  id: u.id,
                  username: u.username,
                  fullName: u.fullName,
                  role: u.role,
                  branchId: u.branchId,
                  provinceId: u.provinceId,
                  active: u.active,
                  lastLoginAt: u.lastLoginAt?.toLocaleString("en-GB") ?? "never",
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
