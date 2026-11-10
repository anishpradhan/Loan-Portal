import Link from "next/link";
import clsx from "clsx";
import { ClassComposition } from "@/components/charts/ClassComposition";
import { Toolbar } from "@/components/shell/Toolbar";
import { CLASS_STYLE } from "@/components/ui/ClassBadge";
import { DataTable } from "@/components/ui/DataTable";
import { Card, EmptyState, PageHeader, Stat, Tabs } from "@/components/ui/primitives";
import { total } from "@/domain/aggregate";
import { formatCompactNPR, formatNPR, pct } from "@/domain/money";
import { PROVISION_BUCKETS } from "@/domain/provisioning";
import { upcomingPeriodEnds, ymd } from "@/domain/nepali";
import { fmtDual, snapshotDay } from "@/lib/dates";
import { endOverrideAction } from "@/server/actions/provisioning";
import { hrefWith, loadContext, type SearchParams } from "@/server/pageContext";
import { moneyDelta } from "@/server/views/common";
import { activeOverrides, irBasedGaps, migrationMatrix, projectProvision } from "@/server/views/provisioning";
import { OverrideForm } from "./OverrideForm";

export const metadata = { title: "Provisioning" };

export default async function ProvisioningPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await loadContext(searchParams, { withPrevious: true });
  if (!ctx.current) return <EmptyState title="No data imported yet" />;
  const tab = ["projection", "ir", "migration", "overrides"].includes(ctx.params.tab) ? ctx.params.tab : "projection";
  const rows = ctx.positions.filter((l) => !l.excludeFromProvisioning);
  const prevRows = ctx.previousPositions?.filter((l) => !l.excludeFromProvisioning) ?? null;
  const t = total(rows);
  const p = prevRows ? total(prevRows) : null;
  const overrides = await activeOverrides(ctx.scope, ctx.current.asOf);
  const overrideTotal = overrides.reduce((s, o) => s + o.amount, 0);

  const day = snapshotDay(ctx.current.asOf);
  const ends = upcomingPeriodEnds(day);
  const quick = [
    { key: ymd(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 30)), label: "+30 days" },
    { key: ymd(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 90)), label: "+90 days" },
    ...ends.map((e) => ({ key: e.key, label: e.label })),
  ];
  const targetKey = /^\d{4}-\d{2}-\d{2}$/.test(ctx.params.target ?? "") ? ctx.params.target : (ends[0]?.key ?? quick[0].key);
  const [ty, tm, td] = targetKey.split("-").map(Number);
  const target = new Date(ty, tm - 1, td);
  const projection = tab === "projection" ? projectProvision(rows, ctx.current.asOf, target) : [];
  const irGaps = tab === "ir" ? irBasedGaps(rows) : [];
  const matrix = prevRows ? migrationMatrix(prevRows, rows) : null;
  const canEdit = ctx.user.role === "ADMIN" || ctx.user.role === "SENIOR";

  return (
    <>
      <PageHeader title="Loan Loss Provisioning" subtitle={`As of ${fmtDual(ctx.current.asOf)} · staff loans excluded`} />
      <Toolbar ctx={ctx} path="/provisioning" staffToggle={false} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Provision required" value={formatCompactNPR(t.provision)} delta={moneyDelta(t.provision, p?.provision)} sub={`${pct(t.outstanding ? t.provision / t.outstanding : 0)} of outstanding`} />
        <Stat label="Additional (manual)" value={formatCompactNPR(overrideTotal)} sub={`${overrides.length} active entries`} href={hrefWith("/provisioning", ctx.params, { tab: "overrides" })} />
        <Stat label="Total provision" value={formatCompactNPR(t.provision + overrideTotal)} />
        <Stat label="Non-performing" value={pct(t.nplRatio)} sub={`${(t.countByClass.SUBSTANDARD + t.countByClass.DOUBTFUL + t.countByClass.BAD).toLocaleString("en-IN")} loans over 90 DPD`} />
      </div>

      <div className="mt-6">
        <Card title="Classification and provision by class">
          <ClassComposition outstanding={t.outstandingByClass} counts={t.countByClass} provision={t.provisionByClass} />
        </Card>
      </div>

      <div className="mt-8">
        <Tabs
          active={tab}
          items={[
            { key: "projection", label: "Projected slippage", href: hrefWith("/provisioning", ctx.params, { tab: "projection" }) },
            { key: "ir", label: "Interest-based DPD check", href: hrefWith("/provisioning", ctx.params, { tab: "ir" }) },
            { key: "migration", label: "Class migration", href: hrefWith("/provisioning", ctx.params, { tab: "migration" }) },
            { key: "overrides", label: "Additional provision", href: hrefWith("/provisioning", ctx.params, { tab: "overrides" }) },
          ]}
        />

        {tab === "projection" && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">If unpaid until</span>
              {quick.map((q) => (
                <Link
                  key={q.key + q.label}
                  href={hrefWith("/provisioning", ctx.params, { tab: "projection", target: q.key })}
                  className={clsx("rounded-full border px-3 py-1", q.key === targetKey ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2")}
                >
                  {q.label}
                </Link>
              ))}
            </div>
            <p className="mb-3 text-sm">
              <strong>{projection.length}</strong> loans would move to a worse class by <strong>{fmtDual(new Date(Date.UTC(ty, tm - 1, td)))}</strong>, needing an additional{" "}
              <strong>Rs. {formatNPR(projection.reduce((s, r) => s + r.additional, 0))}</strong> of provision. Prioritise these for recovery follow-up.
            </p>
            <DataTable
              exportName={`projected-slippage-${targetKey}`}
              initialSort={{ key: "additional", dir: "desc" }}
              columns={[
                { key: "accountNumber", label: "Account", href: "/accounts/{accountNumber}" },
                { key: "borrower", label: "Borrower" },
                { key: "branch", label: "Branch" },
                { key: "outstanding", label: "Outstanding", kind: "money", total: true },
                { key: "dpd", label: "DPD now", kind: "dpd" },
                { key: "projectedDpd", label: "DPD then", kind: "dpd" },
                { key: "cls", label: "Class now", kind: "class" },
                { key: "projectedCls", label: "Class then", kind: "class" },
                { key: "additional", label: "Additional provision", kind: "money", total: true },
              ]}
              rows={projection.map((r) => ({ ...r }))}
            />
          </>
        )}

        {tab === "ir" && (
          <>
            <p className="mb-3 text-sm text-muted">
              Days implied by unpaid interest = interest due ÷ daily interest. Where that is higher than the reported DPD and lands in a worse class, the loan is listed (sheet “LLP as Per IR”).
            </p>
            <DataTable
              exportName="ir-based-dpd"
              initialSort={{ key: "additional", dir: "desc" }}
              columns={[
                { key: "accountNumber", label: "Account", href: "/accounts/{accountNumber}" },
                { key: "borrower", label: "Borrower" },
                { key: "branch", label: "Branch" },
                { key: "outstanding", label: "Outstanding", kind: "money", total: true },
                { key: "interestDue", label: "Interest due", kind: "money", total: true },
                { key: "dpd", label: "Reported DPD", kind: "dpd" },
                { key: "irDpd", label: "Interest DPD", kind: "dpd" },
                { key: "cls", label: "Class", kind: "class" },
                { key: "irCls", label: "Class by interest", kind: "class" },
                { key: "additional", label: "Gap", kind: "money", total: true },
              ]}
              rows={irGaps.map((r) => ({ ...r }))}
            />
          </>
        )}

        {tab === "migration" &&
          (matrix && ctx.previous ? (
            <Card title="Class migration" subtitle={`Loans present in both snapshots: ${fmtDual(ctx.previous.asOf)} (rows) → ${fmtDual(ctx.current.asOf)} (columns)`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="p-2 text-left font-medium">From \ To</th>
                      {PROVISION_BUCKETS.map((b) => (
                        <th key={b.cls} className="p-2 text-right font-medium">{CLASS_STYLE[b.cls].label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PROVISION_BUCKETS.map((from, i) => (
                      <tr key={from.cls} className="border-t border-border">
                        <th className="p-2 text-left font-medium">{CLASS_STYLE[from.cls].label}</th>
                        {PROVISION_BUCKETS.map((to, j) => {
                          const c = matrix[from.cls][to.cls];
                          return (
                            <td
                              key={to.cls}
                              className={clsx("p-2 num", c.count && j > i && "bg-critical/10 text-critical-text font-medium", c.count && j < i && "bg-good/10 text-good-text font-medium")}
                              title={`Rs. ${formatNPR(c.outstanding)}`}
                            >
                              {c.count ? (
                                <>
                                  {c.count.toLocaleString("en-IN")}
                                  <div className="text-xs opacity-80">{formatCompactNPR(c.outstanding)}</div>
                                </>
                              ) : (
                                <span className="text-muted">–</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted">Shaded red above the diagonal = downgrades; green below = upgrades.</p>
            </Card>
          ) : (
            <p className="text-sm text-muted">Needs an earlier snapshot to compare with.</p>
          ))}

        {tab === "overrides" && (
          <div className="space-y-6">
            {canEdit && (
              <Card title="Record additional provision" subtitle="Management overlay on top of the DPD-based provision (“Add: LLP”)">
                <OverrideForm defaultDate={ymd(day)} />
              </Card>
            )}
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-2">
                  <tr>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Borrower</th>
                    <th className="px-3 py-2">Branch</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">From</th>
                    <th className="px-3 py-2">By</th>
                    {canEdit && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {overrides.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted">No additional provision recorded.</td>
                    </tr>
                  )}
                  {overrides.map((o) => (
                    <tr key={o.id} className="border-t border-border">
                      <td className="px-3 py-2"><Link className="text-accent hover:underline" href={`/accounts/${o.accountNumber}`}>{o.accountNumber}</Link></td>
                      <td className="px-3 py-2">{o.borrower}</td>
                      <td className="px-3 py-2">{o.branch}</td>
                      <td className="px-3 py-2 num">{formatNPR(o.amount)}</td>
                      <td className="px-3 py-2">{o.reason}</td>
                      <td className="px-3 py-2">{o.effectiveFrom.slice(0, 10)}</td>
                      <td className="px-3 py-2">{o.createdBy}</td>
                      {canEdit && (
                        <td className="px-3 py-2 text-right">
                          <form action={endOverrideAction}>
                            <input type="hidden" name="id" value={o.id} />
                            <button className="text-xs text-critical-text hover:underline">End</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
