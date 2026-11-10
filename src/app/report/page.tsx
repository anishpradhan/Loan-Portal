import Link from "next/link";
import { SvgTrend } from "@/components/report/SvgTrend";
import { ReportTable, type RCol } from "@/components/report/ReportTable";
import { CLASS_STYLE } from "@/components/ui/ClassBadge";
import type { PortfolioSummary } from "@/domain/aggregate";
import { formatCompactNPR, formatNPR, pct } from "@/domain/money";
import { PROVISION_BUCKETS } from "@/domain/provisioning";
import { fmtDual } from "@/lib/dates";
import { audit } from "@/server/audit";
import { loadContext, type SearchParams } from "@/server/pageContext";
import { buildReport, REPORT_SECTIONS, type SectionKey } from "@/server/views/report";
import { ReportActions } from "./ReportActions";

export const metadata = { title: "Report" };

// Report is always rendered light, whatever the viewer's theme.
const LIGHT: React.CSSProperties = {
  ["--bg" as string]: "#ffffff", ["--surface" as string]: "#ffffff", ["--surface-2" as string]: "#f4f4f1",
  ["--border" as string]: "#e3e2dd", ["--text" as string]: "#16161a", ["--text-2" as string]: "#52514e",
  ["--muted" as string]: "#6f6e69", ["--accent" as string]: "#1c5cab", ["--good-text" as string]: "#006300",
  ["--critical-text" as string]: "#a32525", colorScheme: "light", background: "#fff", color: "#16161a",
};

const M = (v: number) => formatNPR(v, { decimals: 0 });

function summaryCols(label: string, withShare = true): RCol<PortfolioSummary>[] {
  return [
    // "004-Lagankhel Branch" → "004 Lagankhel" keeps rows on one line
    { label, cell: (r) => r.key.replace(/^(\d{3})-/, "$1 ").replace(/ Branch$/, "") },
    { label: "Loans", num: true, cell: (r) => r.accounts.toLocaleString("en-IN") },
    { label: "Outstanding", num: true, cell: (r) => M(r.outstanding) },
    ...(withShare ? [{ label: "Share", num: true, cell: (r: PortfolioSummary) => pct(r.weight, 1) }] : []),
    { label: "Principal OD", num: true, cell: (r) => M(r.principalOverdue) },
    { label: "Interest due", num: true, cell: (r) => M(r.interestDue) },
    { label: "NPL %", num: true, cell: (r) => pct(r.nplRatio, 1) },
    { label: "Provision", num: true, cell: (r) => M(r.provision) },
    { label: "Yield", num: true, cell: (r) => `${r.yieldRate.toFixed(2)}%` },
  ];
}

function withFoot(cols: RCol<PortfolioSummary>[], t: PortfolioSummary): RCol<PortfolioSummary>[] {
  const foot: Record<string, React.ReactNode> = {
    Loans: t.accounts.toLocaleString("en-IN"), Outstanding: M(t.outstanding), Share: "100%",
    "Principal OD": M(t.principalOverdue), "Interest due": M(t.interestDue), "NPL %": pct(t.nplRatio, 1),
    Provision: M(t.provision), Yield: `${t.yieldRate.toFixed(2)}%`,
  };
  return cols.map((c, i) => ({ ...c, foot: i === 0 ? "Total" : foot[c.label] }));
}

function Section({ n, title, children, breakBefore, long }: { n: number; title: string; children: React.ReactNode; breakBefore?: boolean; long?: boolean }) {
  // Short sections stay on one page; long tables may flow but never strand their heading.
  return (
    <section className={`mt-7 ${breakBefore ? "print-break" : ""}`} style={long ? undefined : { breakInside: "avoid" }}>
      <h2 className="mb-2 border-b border-[#1c3a63] pb-1 text-[15px] font-semibold text-[#1c3a63]" style={{ breakAfter: "avoid" }}>
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, change }: { label: string; value: string; change?: string }) {
  return (
    <div className="rounded-md border border-[#e3e2dd] px-3 py-2" style={{ breakInside: "avoid" }}>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-[#6f6e69]">{label}</div>
      <div className="mt-0.5 text-[17px] font-semibold">{value}</div>
      {change && <div className="text-[10px] text-[#52514e]">{change}</div>}
    </div>
  );
}

export default async function ReportPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await loadContext(searchParams, { withPrevious: true });
  const r = await buildReport(ctx);
  if (!r) return <p className="p-10">No data imported yet.</p>;
  await audit(ctx.user.id, "report.view", "report", undefined, { params: ctx.params });
  const on = (k: SectionKey) => r.sections.has(k);
  const t = r.totals;
  const p = r.previousTotals;
  const chg = (cur: number, prev?: number) => (prev === undefined ? undefined : `${cur - prev >= 0 ? "▲" : "▼"} ${formatCompactNPR(Math.abs(cur - prev))} vs previous`);
  let n = 0;
  const pdfMode = ctx.params.pdf === "1";

  return (
    <div style={LIGHT} className="min-h-screen">
      {!pdfMode && (
        <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[#e3e2dd] bg-white/95 px-6 py-3 backdrop-blur">
          <Link href={`/reports?${new URLSearchParams(ctx.params).toString()}`} className="text-sm text-[#1c5cab] hover:underline">← Report options</Link>
          <ReportActions query={new URLSearchParams(ctx.params).toString()} />
        </div>
      )}
      <article className="mx-auto max-w-[820px] px-8 py-8 print:max-w-none print:px-0 print:py-0">
        {/* Cover block */}
        <header className="border-b-4 border-[#1c3a63] pb-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6f6e69]">Confidential · for management use</div>
          <h1 className="mt-2 text-[26px] font-semibold leading-tight text-[#0f2747]">{r.title}</h1>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px] text-[#52514e]">
            <div><span className="text-[#6f6e69]">As of: </span>{fmtDual(r.asOf)}</div>
            <div><span className="text-[#6f6e69]">Compared with: </span>{r.previousAsOf ? fmtDual(r.previousAsOf) : "—"}</div>
            <div><span className="text-[#6f6e69]">Coverage: </span>{r.scopeLabel}{r.includeStaff ? " (incl. staff loans)" : " (excl. staff loans)"}</div>
            <div><span className="text-[#6f6e69]">Prepared by: </span>{r.preparedBy}, {r.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</div>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-4 gap-2">
          <Kpi label="Loan outstanding" value={`Rs. ${formatCompactNPR(t.outstanding)}`} change={chg(t.outstanding, p?.outstanding)} />
          <Kpi label="NPL ratio" value={pct(t.nplRatio)} change={p ? `${t.nplRatio >= p.nplRatio ? "▲" : "▼"} ${Math.abs((t.nplRatio - p.nplRatio) * 100).toFixed(2)} pp vs previous` : undefined} />
          <Kpi label="Provision required" value={`Rs. ${formatCompactNPR(t.provision)}`} change={chg(t.provision, p?.provision)} />
          <Kpi label="Principal overdue" value={`Rs. ${formatCompactNPR(t.principalOverdue)}`} change={chg(t.principalOverdue, p?.principalOverdue)} />
        </div>

        {on("summary") && (
          <Section n={++n} title="Executive summary">
            <ul className="list-disc space-y-1 pl-5 text-[12px] leading-relaxed">
              {r.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </Section>
        )}

        {on("trend") && (
          <Section n={++n} title="Portfolio trend">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 text-[11px] font-medium text-[#52514e]">Loan outstanding</div>
                <SvgTrend title="Loan outstanding trend" width={380} points={r.trend.map((x) => ({ label: x.asOf.toISOString().slice(5, 10), value: x.outstanding }))} />
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium text-[#52514e]">NPL ratio</div>
                <SvgTrend title="NPL ratio trend" kind="pct" width={380} points={r.trend.map((x) => ({ label: x.asOf.toISOString().slice(5, 10), value: x.outstanding ? x.npl / x.outstanding : 0 }))} />
              </div>
            </div>
          </Section>
        )}

        {on("classification") && (
          <Section n={++n} title="Loan classification and provisioning">
            <ReportTable
              foot
              cols={[
                { label: "Class", cell: (b) => <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: CLASS_STYLE[b.cls].color }} />{CLASS_STYLE[b.cls].label}</span>, foot: "Total" },
                { label: "DPD", cell: (b) => b.range },
                { label: "Rate", num: true, cell: (b) => `${b.rate * 100}%` },
                { label: "Loans", num: true, cell: (b) => t.countByClass[b.cls].toLocaleString("en-IN"), foot: t.accounts.toLocaleString("en-IN") },
                { label: "Outstanding", num: true, cell: (b) => M(t.outstandingByClass[b.cls]), foot: M(t.outstanding) },
                { label: "Share", num: true, cell: (b) => pct(t.outstanding ? t.outstandingByClass[b.cls] / t.outstanding : 0), foot: "100%" },
                { label: "Provision", num: true, cell: (b) => M(t.provisionByClass[b.cls]), foot: M(t.provision) },
                { label: "Previous provision", num: true, cell: (b) => (p ? M(p.provisionByClass[b.cls]) : "—"), foot: p ? M(p.provision) : "—" },
              ]}
              rows={PROVISION_BUCKETS.map((b, i) => ({
                ...b,
                range: Number.isFinite(b.maxDpd) ? `${i === 0 ? 0 : PROVISION_BUCKETS[i - 1].maxDpd + 1}–${b.maxDpd}` : `> ${PROVISION_BUCKETS[i - 1].maxDpd}`,
              }))}
            />
            {r.overridesTotal > 0 && (
              <p className="mt-2 text-[11px] text-[#52514e]">Plus management additional provision of Rs. {M(r.overridesTotal)}; total provision Rs. {M(t.provision + r.overridesTotal)}.</p>
            )}
          </Section>
        )}

        {on("province") && (
          <Section n={++n} title="Province summary">
            <ReportTable foot cols={withFoot(summaryCols("Province"), t)} rows={r.byProvince} />
          </Section>
        )}

        {on("branch") && (
          <Section n={++n} title="Branch summary" breakBefore long>
            <ReportTable foot cols={withFoot(summaryCols("Branch"), t)} rows={r.byBranch} />
          </Section>
        )}

        {on("product") && (
          <Section n={++n} title="Product summary" breakBefore={on("branch")} long>
            <ReportTable foot cols={withFoot(summaryCols("Product"), t)} rows={r.byProduct} />
          </Section>
        )}

        {on("movement") && r.movement && (
          <Section n={++n} title="Portfolio movement">
            <ReportTable
              cols={[
                { label: "", cell: (x: { k: string; c?: number; a: number }) => x.k },
                { label: "Loans", num: true, cell: (x) => (x.c === undefined ? "" : x.c.toLocaleString("en-IN")) },
                { label: "Amount (Rs.)", num: true, cell: (x) => M(x.a) },
              ]}
              rows={[
                { k: "Opening outstanding", a: r.movement.opening },
                { k: "+ New loans disbursed", c: r.movement.newCount, a: r.movement.newAmount },
                { k: "+ Top-ups on existing loans", c: r.movement.topupCount, a: r.movement.topupAmount },
                { k: "− Loans closed", c: r.movement.closedCount, a: r.movement.closedAmount },
                { k: "− Principal repaid", c: r.movement.repaymentCount, a: r.movement.repaymentAmount },
                { k: "Closing outstanding", a: r.movement.closing },
                { k: "Provision increased on downgraded loans", a: r.movement.provisionUp },
                { k: "Provision released on upgraded / repaid loans", a: r.movement.provisionDown },
              ]}
            />
          </Section>
        )}

        {on("recovery") && r.movement && (
          <Section n={++n} title="Recovery by province">
            <ReportTable
              foot
              cols={[
                { label: "Province", cell: (x) => x.key, foot: "Total" },
                { label: "Principal", num: true, cell: (x) => M(x.principal), foot: M(r.movement.recoveryTotal.principal) },
                { label: "Interest", num: true, cell: (x) => M(x.interest), foot: M(r.movement.recoveryTotal.interest) },
                { label: "Penalty & charges", num: true, cell: (x) => M(x.penalty), foot: M(r.movement.recoveryTotal.penalty) },
                { label: "Total", num: true, cell: (x) => M(x.total), foot: M(r.movement.recoveryTotal.total) },
              ]}
              rows={r.movement.recoveryByProvince}
            />
          </Section>
        )}

        {on("concentration") && (
          <Section n={++n} title="Top 20 borrower exposures" breakBefore>
            <ReportTable
              cols={[
                { label: "#", cell: (x) => x.rank },
                { label: "Borrower", cell: (x) => x.borrower },
                { label: "Branch", cell: (x) => x.branches },
                { label: "Loans", num: true, cell: (x) => x.accounts },
                { label: "Outstanding", num: true, cell: (x) => M(x.outstanding) },
                { label: "Share", num: true, cell: (x) => pct(x.share) },
                { label: "Worst DPD", num: true, cell: (x) => x.worstDpd.toLocaleString("en-IN") },
              ]}
              rows={r.topBorrowers.map((b, i) => ({ ...b, rank: i + 1 }))}
            />
          </Section>
        )}

        {on("slippage") && (
          <Section n={++n} title={`Loans at risk of slipping by ${r.slippage.target || "next quarter end"}`}>
            <p className="mb-2 text-[11px] text-[#52514e]">
              {r.slippage.count} loans will move to a worse class if unpaid, needing Rs. {M(r.slippage.additional)} more provision. Largest 25 shown.
            </p>
            <ReportTable
              cols={[
                { label: "Account", cell: (x) => x.accountNumber },
                { label: "Borrower", cell: (x) => x.borrower },
                { label: "Branch", cell: (x) => x.branch.replace(/^\d{3}-/, "") },
                { label: "Outstanding", num: true, cell: (x) => M(x.outstanding) },
                { label: "DPD now → then", num: true, cell: (x) => `${x.dpd} → ${x.projectedDpd}` },
                { label: "Class change", cell: (x) => `${CLASS_STYLE[x.cls].label} → ${CLASS_STYLE[x.projectedCls].label}` },
                { label: "Extra provision", num: true, cell: (x) => M(x.additional) },
              ]}
              rows={r.slippage.rows}
            />
          </Section>
        )}

        {on("budget") && r.budget && (
          <Section n={++n} title={`Budget vs actual · FY ${r.budget.fiscalYear}, ${r.budget.month}`}>
            <ReportTable
              foot
              cols={[
                { label: "Province", cell: (x) => x.key, foot: "Total" },
                { label: "Target", num: true, cell: (x) => M(x.target), foot: M(r.budget.rows.reduce((s, x) => s + x.target, 0)) },
                { label: "Actual", num: true, cell: (x) => M(x.actual), foot: M(r.budget.rows.reduce((s, x) => s + x.actual, 0)) },
                { label: "Gap", num: true, cell: (x) => M(x.actual - x.target), foot: M(r.budget.rows.reduce((s, x) => s + x.actual - x.target, 0)) },
                { label: "Achieved", num: true, cell: (x) => (x.achievement === null ? "—" : pct(x.achievement, 1)) },
              ]}
              rows={r.budget.rows}
            />
          </Section>
        )}

        <footer className="mt-10 border-t border-[#e3e2dd] pt-3 text-[9px] leading-relaxed text-[#6f6e69]">
          Provisioning policy: 0–90 DPD 1%, 91–182 DPD 25%, 183–365 DPD 50%, over 365 DPD 100% of principal outstanding. NPL = outstanding with DPD over 90.
          Amounts in Nepalese Rupees. Source: core banking Loan Master List exports. Sections: {REPORT_SECTIONS.filter((s) => on(s.key)).map((s) => s.label).join(", ")}.
        </footer>
      </article>
    </div>
  );
}
