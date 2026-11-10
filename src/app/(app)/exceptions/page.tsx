import Link from "next/link";
import { Toolbar } from "@/components/shell/Toolbar";
import { DataTable, type Col, type Row } from "@/components/ui/DataTable";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/primitives";
import { interestDue, outstanding, projectedDpd, type LoanPosition } from "@/domain/loan";
import { compareSnapshots, dpdJumps } from "@/domain/movement";
import { bucketFor } from "@/domain/provisioning";
import { fmtDual, snapshotDay } from "@/lib/dates";
import { hrefWith, loadContext, type SearchParams } from "@/server/pageContext";
import { applyStaffFilter } from "@/server/views/common";

export const metadata = { title: "Watchlist" };

const DAY = 86_400_000;

const base: Col[] = [
  { key: "accountNumber", label: "Account", href: "/accounts/{accountNumber}" },
  { key: "borrower", label: "Borrower" },
  { key: "branch", label: "Branch" },
  { key: "product", label: "Product" },
  { key: "outstanding", label: "Outstanding", kind: "money", total: true },
];

function row(l: LoanPosition) {
  return {
    accountNumber: l.accountNumber,
    borrower: l.borrower,
    branch: l.branch,
    product: l.product,
    outstanding: outstanding(l),
    dpd: l.dpd,
    cls: bucketFor(l.dpd).cls,
    maturity: l.maturityDate?.toISOString() ?? null,
    rate: l.interestRate,
    interestDue: interestDue(l),
    principalOverdue: l.overduePrincipal,
  };
}

export default async function WatchlistPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await loadContext(searchParams, { withPrevious: true });
  if (!ctx.current) return <EmptyState title="No data imported yet" />;
  const rows = applyStaffFilter(ctx.positions, ctx.params).filter((l) => outstanding(l) > 0);
  const day = snapshotDay(ctx.current.asOf);
  const horizon = Math.min(365, Math.max(7, Number(ctx.params.days) || 30));

  // 1. About to slip into a worse class within the horizon
  const slipping = rows
    .filter((l) => bucketFor(l.dpd).cls !== bucketFor(projectedDpd(l, day, new Date(day.getTime() + horizon * DAY))).cls && l.dpd > 0)
    .map((l) => {
      const b = bucketFor(l.dpd);
      return { ...row(l), daysToSlip: b.maxDpd - l.dpd + 1, nextCls: bucketFor(b.maxDpd + 1).cls };
    });

  // 2. DPD rising faster than the calendar between snapshots (sheet "DPD Mismatch")
  let jumps: Row[] = [];
  let elapsed = 0;
  if (ctx.previousPositions && ctx.previous) {
    elapsed = Math.round((snapshotDay(ctx.current.asOf).getTime() - snapshotDay(ctx.previous.asOf).getTime()) / DAY);
    const moves = compareSnapshots(applyStaffFilter(ctx.previousPositions, ctx.params), rows);
    jumps = dpdJumps(moves, { dpdJumpTolerance: elapsed + 3 }).map((m) => ({
      accountNumber: m.accountNumber,
      borrower: m.borrower,
      branch: m.branch,
      product: m.product,
      outstanding: m.newOutstanding,
      oldDpd: m.oldDpd,
      newDpd: m.newDpd,
      jump: (m.newDpd ?? 0) - (m.oldDpd ?? 0),
      oldClass: m.oldClass,
      newClass: m.newClass,
    }));
  }

  // 3. Maturing within the horizon (renewal follow-up) and 4. matured but still outstanding
  const maturing = rows
    .filter((l) => l.maturityDate && l.maturityDate.getTime() >= day.getTime() && l.maturityDate.getTime() <= day.getTime() + horizon * DAY)
    .map((l) => ({ ...row(l), daysLeft: Math.round((l.maturityDate!.getTime() - day.getTime()) / DAY) }));
  const expired = rows
    .filter((l) => l.maturityDate && l.maturityDate.getTime() < day.getTime())
    .map((l) => ({ ...row(l), daysPast: Math.round((day.getTime() - l.maturityDate!.getTime()) / DAY) }));

  // 5. Interest stopped (rate below 0.01%), excluding Facilitation Loan as in the workbook
  const stopped = rows.filter((l) => l.interestRate < 0.01 && !/^facilitation loan/i.test(l.product)).map(row);

  const tabs = [
    { key: "slipping", label: `About to slip (${slipping.length})` },
    { key: "jumps", label: `DPD jumps (${jumps.length})` },
    { key: "maturing", label: `Maturing soon (${maturing.length})` },
    { key: "expired", label: `Expired, still outstanding (${expired.length})` },
    { key: "stopped", label: `Interest stopped (${stopped.length})` },
  ];
  const tab = tabs.find((t) => t.key === ctx.params.tab)?.key ?? "slipping";

  return (
    <>
      <PageHeader title="Watchlist" subtitle={`Early-warning lists as of ${fmtDual(ctx.current.asOf)}`} />
      <Toolbar ctx={ctx} path="/exceptions" />
      <Tabs active={tab} items={tabs.map((t) => ({ ...t, href: hrefWith("/exceptions", ctx.params, { tab: t.key }) }))} />
      {(tab === "slipping" || tab === "maturing") && (
        <div className="mb-4 flex items-center gap-2 text-sm no-print">
          <span className="text-muted">Horizon</span>
          {[15, 30, 60, 90].map((d) => (
            <Link key={d} href={hrefWith("/exceptions", ctx.params, { days: String(d) })} className={`rounded-full border px-3 py-1 ${d === horizon ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2"}`}>
              {d} days
            </Link>
          ))}
        </div>
      )}

      {tab === "slipping" && (
        <DataTable
          exportName={`about-to-slip-${horizon}d`}
          initialSort={{ key: "daysToSlip", dir: "asc" }}
          columns={[...base, { key: "dpd", label: "DPD", kind: "dpd" }, { key: "cls", label: "Class", kind: "class" }, { key: "daysToSlip", label: "Days to slip", kind: "int" }, { key: "nextCls", label: "Next class", kind: "class" }, { key: "principalOverdue", label: "Principal OD", kind: "money", total: true }, { key: "interestDue", label: "Interest due", kind: "money", total: true }]}
          rows={slipping}
          empty="No loans will change class in this horizon."
        />
      )}
      {tab === "jumps" &&
        (ctx.previous ? (
          <>
            <p className="mb-3 text-sm text-muted">
              Loans whose DPD rose by more than the {elapsed} calendar day{elapsed === 1 ? "" : "s"} between snapshots plus 3 days of tolerance. Usually a missed instalment or a data correction.
            </p>
            <DataTable
              exportName="dpd-jumps"
              initialSort={{ key: "jump", dir: "desc" }}
              columns={[...base, { key: "oldDpd", label: "Old DPD", kind: "dpd" }, { key: "newDpd", label: "New DPD", kind: "dpd" }, { key: "jump", label: "Jump", kind: "int" }, { key: "oldClass", label: "Old class", kind: "class" }, { key: "newClass", label: "New class", kind: "class" }]}
              rows={jumps}
              empty="No unusual DPD jumps."
            />
          </>
        ) : (
          <p className="text-sm text-muted">Needs an earlier snapshot.</p>
        ))}
      {tab === "maturing" && (
        <DataTable
          exportName={`maturing-${horizon}d`}
          initialSort={{ key: "daysLeft", dir: "asc" }}
          columns={[...base, { key: "maturity", label: "Maturity", kind: "date" }, { key: "daysLeft", label: "Days left", kind: "int" }, { key: "dpd", label: "DPD", kind: "dpd" }, { key: "cls", label: "Class", kind: "class" }]}
          rows={maturing}
        />
      )}
      {tab === "expired" && (
        <DataTable
          exportName="expired-outstanding"
          initialSort={{ key: "outstanding", dir: "desc" }}
          columns={[...base, { key: "maturity", label: "Matured on", kind: "date" }, { key: "daysPast", label: "Days past", kind: "int" }, { key: "dpd", label: "DPD", kind: "dpd" }, { key: "cls", label: "Class", kind: "class" }]}
          rows={expired}
        />
      )}
      {tab === "stopped" && (
        <DataTable
          exportName="interest-stopped"
          initialSort={{ key: "outstanding", dir: "desc" }}
          columns={[...base, { key: "rate", label: "Rate", kind: "rate" }, { key: "dpd", label: "DPD", kind: "dpd" }, { key: "cls", label: "Class", kind: "class" }]}
          rows={stopped}
        />
      )}
    </>
  );
}
