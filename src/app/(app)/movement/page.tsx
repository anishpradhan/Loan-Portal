import { Toolbar } from "@/components/shell/Toolbar";
import { DataTable, type Col } from "@/components/ui/DataTable";
import { EmptyState, Notice, PageHeader, Stat, Tabs } from "@/components/ui/primitives";
import { formatCompactNPR } from "@/domain/money";
import { compareSnapshots, newLoans, reconcileByBranch, type LoanMovement } from "@/domain/movement";
import { fmtDual } from "@/lib/dates";
import { hrefWith, loadContext, type SearchParams } from "@/server/pageContext";
import { applyStaffFilter } from "@/server/views/common";

export const metadata = { title: "Portfolio Movement" };

const TABS = [
  { key: "summary", label: "Branch roll-forward" },
  { key: "new", label: "New loans" },
  { key: "closed", label: "Closed" },
  { key: "topup", label: "Top-ups" },
  { key: "repayment", label: "Repayments" },
  { key: "provup", label: "Provision up" },
  { key: "provdown", label: "Provision down" },
] as const;

const moveCols: Col[] = [
  { key: "accountNumber", label: "Account", href: "/accounts/{accountNumber}" },
  { key: "borrower", label: "Borrower" },
  { key: "branch", label: "Branch" },
  { key: "product", label: "Product" },
  { key: "oldOutstanding", label: "Old balance", kind: "money", total: true },
  { key: "newOutstanding", label: "New balance", kind: "money", total: true },
  { key: "balanceChange", label: "Change", kind: "money", total: true },
  { key: "oldDpd", label: "Old DPD", kind: "dpd" },
  { key: "newDpd", label: "New DPD", kind: "dpd" },
  { key: "oldClass", label: "Old class", kind: "class" },
  { key: "newClass", label: "New class", kind: "class" },
  { key: "provisionChange", label: "Provision change", kind: "delta", total: true },
];

function toRows(m: LoanMovement[]) {
  return m.map((x) => ({ ...x }));
}

export default async function MovementPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await loadContext(searchParams, { withPrevious: true });
  if (!ctx.current) return <EmptyState title="No data imported yet" />;
  const tab = TABS.find((t) => t.key === ctx.params.tab)?.key ?? "summary";

  if (!ctx.previousPositions || !ctx.previous) {
    return (
      <>
        <PageHeader title="Portfolio Movement" />
        <Toolbar ctx={ctx} path="/movement" />
        <Notice>Movement compares two snapshots. Import an earlier Loan Master List to see new, closed and top-up loans.</Notice>
      </>
    );
  }

  const moves = compareSnapshots(applyStaffFilter(ctx.previousPositions, ctx.params), applyStaffFilter(ctx.positions, ctx.params));
  const nl = newLoans(moves);
  const closed = moves.filter((m) => m.type === "CLOSED");
  const topups = moves.filter((m) => m.type === "TOP_UP");
  const repay = moves.filter((m) => m.type === "REPAYMENT");
  const provUp = moves.filter((m) => m.provisionChange > 0);
  const provDown = moves.filter((m) => m.provisionChange < 0);
  const sum = (xs: LoanMovement[], f: (m: LoanMovement) => number) => xs.reduce((s, m) => s + f(m), 0);
  const recon = reconcileByBranch(moves);

  const lists: Record<string, LoanMovement[]> = { new: nl, closed, topup: topups, repayment: repay, provup: provUp, provdown: provDown };

  return (
    <>
      <PageHeader
        title="Portfolio Movement"
        subtitle={<>From {fmtDual(ctx.previous.asOf)} to {fmtDual(ctx.current.asOf)}</>}
      />
      <Toolbar ctx={ctx} path="/movement" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="New loans" value={nl.length} sub={formatCompactNPR(sum(nl, (m) => m.newOutstanding))} href={hrefWith("/movement", ctx.params, { tab: "new" })} />
        <Stat label="Closed" value={closed.length} sub={formatCompactNPR(sum(closed, (m) => m.oldOutstanding))} href={hrefWith("/movement", ctx.params, { tab: "closed" })} />
        <Stat label="Top-ups" value={topups.length} sub={formatCompactNPR(sum(topups, (m) => m.balanceChange))} href={hrefWith("/movement", ctx.params, { tab: "topup" })} />
        <Stat label="Repayments" value={repay.length} sub={formatCompactNPR(-sum(repay, (m) => m.balanceChange))} href={hrefWith("/movement", ctx.params, { tab: "repayment" })} />
        <Stat label="Provision up" value={provUp.length} sub={`+${formatCompactNPR(sum(provUp, (m) => m.provisionChange))}`} href={hrefWith("/movement", ctx.params, { tab: "provup" })} />
        <Stat label="Provision down" value={provDown.length} sub={formatCompactNPR(sum(provDown, (m) => m.provisionChange))} href={hrefWith("/movement", ctx.params, { tab: "provdown" })} />
      </div>

      <div className="mt-8">
        <Tabs active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: hrefWith("/movement", ctx.params, { tab: t.key }) }))} />
        {tab === "summary" ? (
          <>
            <p className="mb-3 text-sm text-muted">
              Opening + new loans + top-ups − closed − repayments = closing. The difference column must be zero; anything else means the two exports are inconsistent.
            </p>
            <DataTable
              exportName="branch-roll-forward"
              initialSort={{ key: "branch", dir: "asc" }}
              pageSize={100}
              columns={[
                { key: "branch", label: "Branch" },
                { key: "opening", label: "Opening", kind: "money", total: true },
                { key: "newLoans", label: "+ New", kind: "money", total: true },
                { key: "topUps", label: "+ Top-ups", kind: "money", total: true },
                { key: "closed", label: "− Closed", kind: "money", total: true },
                { key: "repayments", label: "− Repayments", kind: "money", total: true },
                { key: "closing", label: "Closing", kind: "money", total: true },
                { key: "difference", label: "Difference", kind: "money", total: true },
              ]}
              rows={recon.map((r) => ({ ...r }))}
            />
          </>
        ) : (
          <DataTable columns={moveCols} rows={toRows(lists[tab])} exportName={`movement-${tab}`} initialSort={{ key: tab.startsWith("prov") ? "provisionChange" : "balanceChange", dir: tab === "provup" || tab === "new" || tab === "topup" ? "desc" : "asc" }} />
        )}
      </div>
    </>
  );
}
