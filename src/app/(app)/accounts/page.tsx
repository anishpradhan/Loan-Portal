import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/primitives";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { accountWhere, scopeFor } from "@/server/auth/scope";
import { one, type SearchParams } from "@/server/pageContext";

export const metadata = { title: "Account Search" };

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const scope = await scopeFor(user);
  const q = (one((await searchParams).q) ?? "").trim();
  const digits = q.replace(/\D/g, "");

  const results = q.length >= 3
    ? await prisma.loanAccount.findMany({
        where: {
          ...accountWhere(scope),
          OR: [
            ...(digits.length >= 3 ? [{ accountNumber: { contains: digits } }] : []),
            { borrower: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        },
        include: { borrower: true, branch: true, product: true },
        take: 200,
        orderBy: { accountNumber: "asc" },
      })
    : [];

  return (
    <>
      <PageHeader title="Account Search" subtitle={`Search by account number or borrower name · ${scope.label}`} />
      <form className="mb-6 flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="e.g. 001201639700006 or Nagarik Kalyan"
          className="w-full max-w-xl rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          aria-label="Account number or borrower name"
        />
        <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent">Search</button>
      </form>
      {q.length > 0 && q.length < 3 && <p className="text-sm text-muted">Type at least 3 characters.</p>}
      {q.length >= 3 && (
        <DataTable
          searchable={false}
          columns={[
            { key: "accountNumber", label: "Account", href: "/accounts/{accountNumber}" },
            { key: "borrower", label: "Borrower" },
            { key: "branch", label: "Branch" },
            { key: "product", label: "Product" },
            { key: "opening", label: "Opened", kind: "date" },
            { key: "maturity", label: "Maturity", kind: "date" },
          ]}
          rows={results.map((a) => ({
            accountNumber: a.accountNumber,
            borrower: a.borrower.name,
            branch: a.branch.name,
            product: a.product.name,
            opening: a.openingDate?.toISOString() ?? null,
            maturity: a.maturityDate?.toISOString() ?? null,
          }))}
          empty="No matching accounts in your scope."
        />
      )}
    </>
  );
}
