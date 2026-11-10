import Link from "next/link";
import { Toolbar } from "@/components/shell/Toolbar";
import { DataTable, type Col } from "@/components/ui/DataTable";
import { Card, EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { summarize } from "@/domain/aggregate";
import { interestDue, outstanding, provisionFor, requiredToClose, type LoanPosition } from "@/domain/loan";
import { fmtDual } from "@/lib/dates";
import { hrefWith, loadContext, type SearchParams } from "@/server/pageContext";
import { applyStaffFilter, summaryRows } from "@/server/views/common";

export const metadata = { title: "Portfolio" };

const DIMS = {
  branch: { label: "Branch", key: (l: LoanPosition) => l.branch },
  province: { label: "Province", key: (l: LoanPosition) => l.province ?? "Unassigned" },
  product: { label: "Product", key: (l: LoanPosition) => l.product },
} as const;
type Dim = keyof typeof DIMS;

export default async function PortfolioPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await loadContext(searchParams);
  if (!ctx.current) return <EmptyState title="No data imported yet" />;
  const by: Dim = (ctx.params.by as Dim) in DIMS ? (ctx.params.by as Dim) : "branch";
  const filters = (["branch", "province", "product"] as const).filter((f) => ctx.params[f]);

  let rows = applyStaffFilter(ctx.positions, ctx.params);
  for (const f of filters) rows = rows.filter((l) => DIMS[f].key(l) === ctx.params[f]);
  const summaries = summarize(rows, DIMS[by].key);

  const drill: Dim = by === "province" ? "branch" : by === "branch" ? "product" : "branch";
  const cols: Col[] = [
    { key: "key", label: DIMS[by].label, href: hrefWith("/portfolio", ctx.params, { by: drill, [by]: "__KEY__" }).replace("__KEY__", "{key}") },
    { key: "accounts", label: "Loans", kind: "int", total: true },
    { key: "outstanding", label: "Outstanding", kind: "money", total: true },
    { key: "weight", label: "Share", kind: "pct" },
    { key: "principalOverdue", label: "Principal OD", kind: "money", total: true },
    { key: "overdueRatio", label: "OD %", kind: "pct" },
    { key: "interestDue", label: "Interest due", kind: "money", total: true },
    { key: "penaltyDue", label: "Penalty due", kind: "money", total: true },
    { key: "npl", label: "NPL %", kind: "pct" },
    { key: "provision", label: "Provision", kind: "money", total: true },
    { key: "yieldRate", label: "Yield", kind: "rate" },
  ];

  const loanCols: Col[] = [
    { key: "accountNumber", label: "Account", href: "/accounts/{accountNumber}" },
    { key: "borrower", label: "Borrower" },
    { key: "branch", label: "Branch" },
    { key: "product", label: "Product" },
    { key: "outstanding", label: "Outstanding", kind: "money", total: true },
    { key: "principalOverdue", label: "Principal OD", kind: "money", total: true },
    { key: "interestDue", label: "Interest due", kind: "money", total: true },
    { key: "dpd", label: "DPD", kind: "dpd" },
    { key: "cls", label: "Class", kind: "class" },
    { key: "provision", label: "Provision", kind: "money", total: true },
    { key: "requiredToClose", label: "Required to close", kind: "money", total: true },
    { key: "rate", label: "Rate", kind: "rate" },
    { key: "maturity", label: "Maturity", kind: "date" },
  ];
  const loanRows = rows.map((l) => {
    const p = provisionFor(l);
    return {
      accountNumber: l.accountNumber,
      borrower: l.borrower,
      branch: l.branch,
      product: l.product,
      outstanding: outstanding(l),
      principalOverdue: l.overduePrincipal,
      interestDue: interestDue(l),
      dpd: l.dpd,
      cls: p.cls,
      provision: l.excludeFromProvisioning ? 0 : p.amount,
      requiredToClose: requiredToClose(l),
      rate: l.interestRate,
      maturity: l.maturityDate?.toISOString() ?? null,
    };
  });

  return (
    <>
      <PageHeader title="Portfolio" subtitle={`As of ${fmtDual(ctx.current.asOf)}`} />
      <Toolbar ctx={ctx} path="/portfolio" />
      {filters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Filtered to</span>
          {filters.map((f) => (
            <Link key={f} href={hrefWith("/portfolio", ctx.params, { [f]: null })} className="rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-accent">
              {DIMS[f].label}: {ctx.params[f]} ✕
            </Link>
          ))}
        </div>
      )}
      <Tabs
        active={by}
        items={(Object.keys(DIMS) as Dim[]).map((d) => ({ key: d, label: `By ${DIMS[d].label.toLowerCase()}`, href: hrefWith("/portfolio", ctx.params, { by: d }) }))}
      />
      <Card pad={false} className="border-0 bg-transparent shadow-none">
        <DataTable columns={cols} rows={summaryRows(summaries)} exportName={`portfolio-by-${by}`} initialSort={{ key: "outstanding", dir: "desc" }} pageSize={100} />
      </Card>
      <h2 className="mb-3 mt-10 text-lg font-semibold">Loans</h2>
      <DataTable columns={loanCols} rows={loanRows} exportName="loans" initialSort={{ key: "outstanding", dir: "desc" }} />
    </>
  );
}
