import Link from "next/link";
import { BarList } from "@/components/charts/BarList";
import { ClassComposition } from "@/components/charts/ClassComposition";
import { TrendChart } from "@/components/charts/TrendChart";
import { Toolbar } from "@/components/shell/Toolbar";
import { Card, EmptyState, Notice, PageHeader, Stat } from "@/components/ui/primitives";
import { summarize, total } from "@/domain/aggregate";
import { formatCompactNPR, pct } from "@/domain/money";
import { compareSnapshots, newLoans } from "@/domain/movement";
import { fmtDual } from "@/lib/dates";
import { hrefWith, loadContext, type SearchParams } from "@/server/pageContext";
import { portfolioTrend } from "@/server/repo/trend";
import { applyStaffFilter, countDelta, moneyDelta, ratioDelta } from "@/server/views/common";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await loadContext(searchParams, { withPrevious: true });
  const denied = ctx.params.denied === "1";

  if (!ctx.current) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState title="No data yet">
          {ctx.user.role === "ADMIN" ? (
            <>
              Start by <Link className="text-accent underline" href="/admin/import">importing a Loan Master List</Link> or your consolidated workbook.
            </>
          ) : (
            "An administrator has not imported any loan data yet."
          )}
        </EmptyState>
      </>
    );
  }

  const cur = applyStaffFilter(ctx.positions, ctx.params);
  const prev = ctx.previousPositions ? applyStaffFilter(ctx.previousPositions, ctx.params) : null;
  const t = total(cur);
  const p = prev ? total(prev) : null;
  const byBranch = summarize(cur, (l) => l.branch);
  const byProvince = summarize(cur, (l) => l.province ?? "Unassigned");
  const moves = prev ? compareSnapshots(prev, cur) : [];
  const nl = newLoans(moves);
  const closed = moves.filter((m) => m.type === "CLOSED");
  const recovered = moves.reduce((s, m) => s + m.totalRecovered, 0);

  const trend = await portfolioTrend(ctx.scope, { includeStaff: ctx.params.staff === "1" });
  const trendLabel = (d: Date) => d.toISOString().slice(5, 10);
  const topOverdue = [...byBranch].sort((a, b) => b.principalOverdue - a.principalOverdue).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Portfolio Dashboard"
        subtitle={<>As of {fmtDual(ctx.current.asOf)}{ctx.previous && <> · compared with {fmtDual(ctx.previous.asOf)}</>}</>}
      />
      {denied && (
        <div className="mb-4">
          <Notice tone="warning">You do not have access to that page.</Notice>
        </div>
      )}
      <Toolbar ctx={ctx} path="/" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Loan outstanding" value={formatCompactNPR(t.outstanding)} delta={moneyDelta(t.outstanding, p?.outstanding)} deltaGoodWhen="up" sub={`${t.accounts.toLocaleString("en-IN")} loans`} href={hrefWith("/portfolio", ctx.params, {})} />
        <Stat label="Principal overdue" value={formatCompactNPR(t.principalOverdue)} delta={moneyDelta(t.principalOverdue, p?.principalOverdue)} sub={`${pct(t.overdueRatio)} of outstanding`} />
        <Stat label="Interest due" value={formatCompactNPR(t.interestDue)} delta={moneyDelta(t.interestDue, p?.interestDue)} />
        <Stat label="NPL ratio" value={pct(t.nplRatio)} delta={ratioDelta(t.nplRatio, p?.nplRatio)} sub="DPD over 90" href={hrefWith("/provisioning", ctx.params, {})} />
        <Stat label="Provision required" value={formatCompactNPR(t.provision)} delta={moneyDelta(t.provision, p?.provision)} sub={`${pct(t.outstanding ? t.provision / t.outstanding : 0)} coverage`} href={hrefWith("/provisioning", ctx.params, {})} />
        <Stat label="Yield" value={`${t.yieldRate.toFixed(2)}%`} sub="weighted avg. rate" delta={p ? { text: `${(t.yieldRate - p.yieldRate >= 0 ? "+" : "")}${(t.yieldRate - p.yieldRate).toFixed(3)} pp`, direction: t.yieldRate > p.yieldRate ? "up" : t.yieldRate < p.yieldRate ? "down" : "flat" } : null} deltaGoodWhen="up" />
      </div>

      {prev && (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="New loans" value={nl.length.toLocaleString("en-IN")} sub={formatCompactNPR(nl.reduce((s, m) => s + m.newOutstanding, 0))} href={hrefWith("/movement", ctx.params, { tab: "new" })} />
          <Stat label="Loans closed" value={closed.length.toLocaleString("en-IN")} sub={formatCompactNPR(closed.reduce((s, m) => s + m.oldOutstanding, 0))} href={hrefWith("/movement", ctx.params, { tab: "closed" })} />
          <Stat label="Total recovery" value={formatCompactNPR(recovered)} sub="principal + interest + penalty" href={hrefWith("/recovery", ctx.params, {})} />
          <Stat label="Accounts" value={t.accounts.toLocaleString("en-IN")} delta={countDelta(t.accounts, p?.accounts)} deltaGoodWhen="up" sub={`${t.borrowers.toLocaleString("en-IN")} borrowers`} />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Loan outstanding trend" subtitle="All imported snapshots">
          <TrendChart data={trend.map((x) => ({ label: trendLabel(x.asOf), value: x.outstanding }))} />
        </Card>
        <Card title="NPL ratio trend" subtitle="Outstanding with DPD over 90 ÷ total outstanding">
          <TrendChart kind="pct" data={trend.map((x) => ({ label: trendLabel(x.asOf), value: x.outstanding ? x.npl / x.outstanding : 0 }))} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card title="Loan classification" subtitle="By days past due · provisioning policy 1% / 25% / 50% / 100%">
          <ClassComposition outstanding={t.outstandingByClass} counts={t.countByClass} provision={t.provisionByClass} />
        </Card>
        <Card title="Highest principal overdue" subtitle="Top branches" actions={<Link className="text-xs text-accent hover:underline no-print" href={hrefWith("/portfolio", ctx.params, { by: "branch" })}>All branches →</Link>}>
          <BarList items={topOverdue.map((b) => ({ label: b.key, value: b.principalOverdue, sub: `${pct(b.overdueRatio)} of ${formatCompactNPR(b.outstanding)} outstanding`, href: hrefWith("/portfolio", ctx.params, { by: "product", branch: b.key }) }))} />
        </Card>
      </div>

      {ctx.scope.kind !== "branch" && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card title="Outstanding by province">
            <BarList items={byProvince.map((x) => ({ label: x.key, value: x.outstanding, sub: `${x.accounts} loans · NPL ${pct(x.nplRatio)}` }))} />
          </Card>
          <Card title="Largest branches" subtitle="By outstanding">
            <BarList items={byBranch.slice(0, 8).map((x) => ({ label: x.key, value: x.outstanding, sub: `${pct(x.weight)} of portfolio`, href: hrefWith("/portfolio", ctx.params, { by: "product", branch: x.key }) }))} />
          </Card>
        </div>
      )}
    </>
  );
}
