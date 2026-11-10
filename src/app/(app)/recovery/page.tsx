import { BarList } from "@/components/charts/BarList";
import { Toolbar } from "@/components/shell/Toolbar";
import { DataTable } from "@/components/ui/DataTable";
import { Card, EmptyState, Notice, PageHeader, Stat, Tabs } from "@/components/ui/primitives";
import { formatCompactNPR } from "@/domain/money";
import { compareSnapshots, type LoanMovement } from "@/domain/movement";
import { fmtDual } from "@/lib/dates";
import { hrefWith, loadContext, type SearchParams } from "@/server/pageContext";
import { applyStaffFilter } from "@/server/views/common";

export const metadata = { title: "Recovery" };

interface Agg {
  key: string;
  accounts: number;
  principal: number;
  interest: number;
  penalty: number;
  total: number;
  outstanding: number;
}

function group(moves: LoanMovement[], key: (m: LoanMovement) => string): Agg[] {
  const map = new Map<string, Agg>();
  for (const m of moves) {
    const k = key(m);
    const a = map.get(k) ?? { key: k, accounts: 0, principal: 0, interest: 0, penalty: 0, total: 0, outstanding: 0 };
    if (m.totalRecovered !== 0) a.accounts++;
    a.principal += m.principalRecovered;
    a.interest += m.interestRecovered;
    a.penalty += m.penaltyRecovered;
    a.total += m.totalRecovered;
    a.outstanding += m.newOutstanding;
    map.set(k, a);
  }
  return [...map.values()].sort((x, y) => y.total - x.total);
}

export default async function RecoveryPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await loadContext(searchParams, { withPrevious: true });
  if (!ctx.current) return <EmptyState title="No data imported yet" />;
  if (!ctx.previousPositions || !ctx.previous) {
    return (
      <>
        <PageHeader title="Recovery" />
        <Toolbar ctx={ctx} path="/recovery" />
        <Notice>Recovery is measured between two snapshots. Import an earlier Loan Master List first.</Notice>
      </>
    );
  }
  const by = ctx.params.by === "province" ? "province" : ctx.params.by === "product" ? "product" : "branch";
  const moves = compareSnapshots(applyStaffFilter(ctx.previousPositions, ctx.params), applyStaffFilter(ctx.positions, ctx.params)).filter(
    (m) => m.type !== "NEW",
  );
  const groups = group(moves, (m) => (by === "province" ? m.province ?? "Unassigned" : by === "product" ? m.product : m.branch));
  const t = group(moves, () => "all")[0] ?? { principal: 0, interest: 0, penalty: 0, total: 0, accounts: 0 };
  const days = Math.max(1, Math.round((ctx.current.asOf.getTime() - ctx.previous.asOf.getTime()) / 86_400_000));

  return (
    <>
      <PageHeader title="Recovery" subtitle={<>Collections from {fmtDual(ctx.previous.asOf)} to {fmtDual(ctx.current.asOf)} ({days} day{days > 1 ? "s" : ""})</>} />
      <Toolbar ctx={ctx} path="/recovery" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total recovery" value={formatCompactNPR(t.total)} sub={`${t.accounts.toLocaleString("en-IN")} paying accounts`} />
        <Stat label="Principal" value={formatCompactNPR(t.principal)} />
        <Stat label="Interest" value={formatCompactNPR(t.interest)} />
        <Stat label="Penalty & charges" value={formatCompactNPR(t.penalty)} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card title={`Top ${by === "branch" ? "branches" : by === "province" ? "provinces" : "products"} by recovery`}>
          <BarList items={groups.slice(0, 10).map((g) => ({ label: g.key, value: g.total, sub: `${g.accounts} paying accounts` }))} />
        </Card>
        <div>
          <Tabs
            active={by}
            items={["branch", "province", "product"].map((k) => ({ key: k, label: `By ${k}`, href: hrefWith("/recovery", ctx.params, { by: k }) }))}
          />
          <DataTable
            exportName={`recovery-by-${by}`}
            pageSize={100}
            initialSort={{ key: "total", dir: "desc" }}
            columns={[
              { key: "key", label: by[0].toUpperCase() + by.slice(1) },
              { key: "accounts", label: "Paying", kind: "int", total: true },
              { key: "principal", label: "Principal", kind: "money", total: true },
              { key: "interest", label: "Interest", kind: "money", total: true },
              { key: "penalty", label: "Penalty & chg", kind: "money", total: true },
              { key: "total", label: "Total", kind: "money", total: true },
            ]}
            rows={groups.map((g) => ({ ...g }))}
          />
        </div>
      </div>
      <h2 className="mb-3 mt-10 text-lg font-semibold">Recovery by account</h2>
      <DataTable
        exportName="recovery-accounts"
        initialSort={{ key: "totalRecovered", dir: "desc" }}
        columns={[
          { key: "accountNumber", label: "Account", href: "/accounts/{accountNumber}" },
          { key: "borrower", label: "Borrower" },
          { key: "branch", label: "Branch" },
          { key: "principalRecovered", label: "Principal", kind: "money", total: true },
          { key: "interestRecovered", label: "Interest", kind: "money", total: true },
          { key: "penaltyRecovered", label: "Penalty & chg", kind: "money", total: true },
          { key: "totalRecovered", label: "Total", kind: "money", total: true },
          { key: "newOutstanding", label: "Outstanding now", kind: "money" },
          { key: "newDpd", label: "DPD", kind: "dpd" },
        ]}
        rows={moves.filter((m) => m.totalRecovered !== 0).map((m) => ({ ...m }))}
      />
    </>
  );
}
