import { PageHeader } from "@/components/ui/primitives";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/session";
import { BranchRow } from "./BranchRow";

export const metadata = { title: "Branches" };

export default async function BranchesPage() {
  await requireRole("ADMIN");
  const [branches, provinces] = await Promise.all([
    prisma.branch.findMany({ orderBy: { code: "asc" }, include: { province: true, _count: { select: { accounts: true, users: true } } } }),
    prisma.province.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { branches: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Branches" subtitle="Province assignment decides what each province manager can see." />
      <datalist id="provinces">
        {provinces.map((p) => <option key={p.id} value={p.name} />)}
      </datalist>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-3 py-2">Branch</th>
              <th className="px-3 py-2 text-right">Accounts</th>
              <th className="px-3 py-2 text-right">Users</th>
              <th className="px-3 py-2">Province</th>
              <th className="px-3 py-2">Branch email</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <BranchRow key={b.id} id={b.id} name={b.name} accounts={b._count.accounts} users={b._count.users} province={b.province?.name ?? ""} email={b.email ?? ""} />
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Provinces</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {provinces.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="font-medium">{p.name}</div>
            <div className="text-muted">{p._count.branches} branches{p.manager ? ` · ${p.manager}` : ""}</div>
          </div>
        ))}
      </div>
    </>
  );
}
