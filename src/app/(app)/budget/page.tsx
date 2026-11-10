import { Toolbar } from "@/components/shell/Toolbar";
import { DataTable } from "@/components/ui/DataTable";
import { Card, EmptyState, Notice, PageHeader, Stat } from "@/components/ui/primitives";
import { outstanding } from "@/domain/loan";
import { formatCompactNPR, pct, toPaisa } from "@/domain/money";
import { fiscalMonthName, FISCAL_MONTHS, toBs } from "@/domain/nepali";
import { fmtDual, snapshotDay } from "@/lib/dates";
import { prisma } from "@/server/db";
import { accountWhere } from "@/server/auth/scope";
import { loadContext, type SearchParams } from "@/server/pageContext";
import { applyStaffFilter } from "@/server/views/common";

export const metadata = { title: "Budget vs Actual" };

export default async function BudgetPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await loadContext(searchParams);
  if (!ctx.current) return <EmptyState title="No data imported yet" />;
  const bs = toBs(snapshotDay(ctx.current.asOf));
  const scopeWhere = accountWhere(ctx.scope);
  const branchWhere = "branch" in scopeWhere ? scopeWhere.branch : {};

  const targets = await prisma.budgetTarget.findMany({
    where: { fiscalYear: bs.fiscalYear, branch: branchWhere },
    include: { branch: { include: { province: true } } },
  });

  if (!targets.length) {
    return (
      <>
        <PageHeader title="Budget vs Actual" subtitle={`Fiscal year ${bs.fiscalYear}`} />
        <Toolbar ctx={ctx} path="/budget" />
        <Notice>No budget targets for FY {bs.fiscalYear}. An administrator can import them from the Budget sheet (Import Data).</Notice>
      </>
    );
  }

  const rows = applyStaffFilter(ctx.positions, ctx.params);
  const actualByBranch = new Map<string, number>();
  for (const l of rows) actualByBranch.set(l.branch, (actualByBranch.get(l.branch) ?? 0) + outstanding(l));

  // target for the snapshot's fiscal month, plus the full-year path per branch
  const byBranch = new Map<string, { branch: string; province: string; months: number[] }>();
  for (const t of targets) {
    const e = byBranch.get(t.branch.name) ?? { branch: t.branch.name, province: t.branch.province?.name ?? "Unassigned", months: Array(12).fill(0) };
    e.months[t.month - 1] = toPaisa(t.amount);
    byBranch.set(t.branch.name, e);
  }
  const m = bs.fiscalMonth;
  const table = [...byBranch.values()].map((b) => {
    const target = b.months[m - 1];
    const actual = actualByBranch.get(b.branch) ?? 0;
    return {
      branch: b.branch,
      province: b.province,
      target,
      actual,
      gap: actual - target,
      achievement: target ? actual / target : null,
      yearEnd: b.months[11],
      toYearEnd: b.months[11] - actual,
    };
  });
  const T = table.reduce((s, r) => s + r.target, 0);
  const A = table.reduce((s, r) => s + r.actual, 0);
  const Y = table.reduce((s, r) => s + r.yearEnd, 0);
  const behind = table.filter((r) => r.achievement !== null && r.achievement < 1).length;

  const monthly = FISCAL_MONTHS.map((name, i) => ({
    month: name,
    target: [...byBranch.values()].reduce((s, b) => s + b.months[i], 0),
  }));

  return (
    <>
      <PageHeader title="Budget vs Actual" subtitle={`Loan outstanding against target · FY ${bs.fiscalYear}, ${fiscalMonthName(m)} (as of ${fmtDual(ctx.current.asOf)})`} />
      <Toolbar ctx={ctx} path="/budget" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`${fiscalMonthName(m)} target`} value={formatCompactNPR(T)} />
        <Stat label="Actual outstanding" value={formatCompactNPR(A)} sub={T ? `${pct(A / T)} achieved` : undefined} />
        <Stat label="Gap" value={formatCompactNPR(A - T)} delta={{ text: A >= T ? "ahead of target" : "behind target", direction: A >= T ? "up" : "down" }} deltaGoodWhen="up" />
        <Stat label="Branches behind" value={`${behind} / ${table.length}`} sub={`Year-end target ${formatCompactNPR(Y)}`} />
      </div>
      <div className="mt-6">
        <DataTable
          exportName={`budget-vs-actual-${bs.fiscalYear.replace("/", "-")}-m${m}`}
          pageSize={100}
          initialSort={{ key: "achievement", dir: "asc" }}
          columns={[
            { key: "branch", label: "Branch" },
            { key: "province", label: "Province" },
            { key: "target", label: `Target (${fiscalMonthName(m)})`, kind: "money", total: true },
            { key: "actual", label: "Actual", kind: "money", total: true },
            { key: "gap", label: "Gap", kind: "money", total: true },
            { key: "achievement", label: "Achieved", kind: "pct" },
            { key: "yearEnd", label: "Year-end target", kind: "money", total: true },
            { key: "toYearEnd", label: "Still to grow", kind: "money", total: true },
          ]}
          rows={table}
        />
      </div>
      <div className="mt-6">
        <Card title={`Monthly target path · FY ${bs.fiscalYear}`}>
          <div className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
            {monthly.map((x, i) => (
              <div key={x.month} className={`rounded-lg border p-2 ${i + 1 === m ? "border-accent bg-accent-soft" : "border-border"}`}>
                <div className="text-xs text-muted">{x.month}</div>
                <div className="num text-left font-medium">{formatCompactNPR(x.target)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
