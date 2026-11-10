import "server-only";
import { summarize, total, type PortfolioSummary } from "@/domain/aggregate";
import { outstanding, type LoanPosition } from "@/domain/loan";
import { formatCompactNPR, pct, toPaisa } from "@/domain/money";
import { compareSnapshots, newLoans, reconcileByBranch } from "@/domain/movement";
import { toBs, upcomingPeriodEnds, fiscalMonthName } from "@/domain/nepali";
import { snapshotDay } from "@/lib/dates";
import { prisma } from "@/server/db";
import type { PageContext } from "@/server/pageContext";
import type { Scope } from "@/server/auth/scope";
import { portfolioTrend, type TrendPoint } from "@/server/repo/trend";
import { applyStaffFilter } from "./common";
import { activeOverrides, projectProvision } from "./provisioning";

export const REPORT_SECTIONS = [
  { key: "summary", label: "Executive summary" },
  { key: "trend", label: "Portfolio trend" },
  { key: "classification", label: "Classification & provisioning" },
  { key: "province", label: "Province summary" },
  { key: "branch", label: "Branch summary" },
  { key: "product", label: "Product summary" },
  { key: "movement", label: "Portfolio movement" },
  { key: "recovery", label: "Recovery" },
  { key: "concentration", label: "Top borrower exposures" },
  { key: "slippage", label: "Loans at risk of slipping" },
  { key: "budget", label: "Budget vs actual" },
] as const;
export type SectionKey = (typeof REPORT_SECTIONS)[number]["key"];

export interface ReportData {
  title: string;
  scopeLabel: string;
  asOf: Date;
  previousAsOf: Date | null;
  generatedAt: Date;
  preparedBy: string;
  sections: Set<SectionKey>;
  includeStaff: boolean;
  totals: PortfolioSummary;
  previousTotals: PortfolioSummary | null;
  highlights: string[];
  trend: TrendPoint[];
  byProvince: PortfolioSummary[];
  byBranch: PortfolioSummary[];
  byProduct: PortfolioSummary[];
  movement: null | {
    newCount: number; newAmount: number;
    closedCount: number; closedAmount: number;
    topupCount: number; topupAmount: number;
    repaymentCount: number; repaymentAmount: number;
    provisionUp: number; provisionDown: number;
    opening: number; closing: number;
    recoveryByProvince: { key: string; principal: number; interest: number; penalty: number; total: number }[];
    recoveryTotal: { principal: number; interest: number; penalty: number; total: number };
  };
  topBorrowers: { borrower: string; accounts: number; branches: string; outstanding: number; share: number; worstDpd: number }[];
  slippage: { target: string; count: number; additional: number; rows: ReturnType<typeof projectProvision> };
  overridesTotal: number;
  budget: null | { fiscalYear: string; month: string; rows: { key: string; target: number; actual: number; achievement: number | null }[] };
}

/** Filter positions to a sub-scope requested in the report form (never wider than the user's scope). */
function narrow(rows: LoanPosition[], params: Record<string, string>) {
  let r = rows;
  if (params.province) r = r.filter((l) => l.province === params.province);
  if (params.branch) r = r.filter((l) => l.branch === params.branch);
  return r;
}

/**
 * Narrow the trend to the requested province/branch, but only when that
 * province/branch is inside the user's own scope (checked against their data).
 */
function trendScope(ctx: PageContext): Scope {
  const { branch, province } = ctx.params;
  if (branch && ctx.positions.some((l) => l.branch === branch)) return { kind: "branch", branchCode: branch.slice(0, 3), label: branch };
  if (province && ctx.positions.some((l) => l.province === province)) return { kind: "province", province, label: province };
  return ctx.scope;
}

export async function buildReport(ctx: PageContext): Promise<ReportData | null> {
  if (!ctx.current) return null;
  const params = ctx.params;
  const requested = (params.sections ?? "").split(",").filter(Boolean) as SectionKey[];
  const sections = new Set<SectionKey>(requested.length ? requested : REPORT_SECTIONS.map((s) => s.key));
  const includeStaff = params.staff === "1";

  const cur = narrow(applyStaffFilter(ctx.positions, params), params);
  const prev = ctx.previousPositions ? narrow(applyStaffFilter(ctx.previousPositions, params), params) : null;
  const t = total(cur);
  const p = prev ? total(prev) : null;
  const scopeLabel = params.branch || (params.province ? `${params.province} Province` : ctx.scope.label);

  // Movement & recovery
  let movement: ReportData["movement"] = null;
  if (prev) {
    const moves = compareSnapshots(prev, cur);
    const nl = newLoans(moves);
    const sum = (xs: typeof moves, f: (m: (typeof moves)[number]) => number) => xs.reduce((s, m) => s + f(m), 0);
    const closed = moves.filter((m) => m.type === "CLOSED");
    const topups = moves.filter((m) => m.type === "TOP_UP");
    const repay = moves.filter((m) => m.type === "REPAYMENT");
    const recon = reconcileByBranch(moves);
    const rp = new Map<string, { key: string; principal: number; interest: number; penalty: number; total: number }>();
    for (const m of moves) {
      const k = m.province ?? "Unassigned";
      const a = rp.get(k) ?? { key: k, principal: 0, interest: 0, penalty: 0, total: 0 };
      a.principal += m.principalRecovered;
      a.interest += m.interestRecovered;
      a.penalty += m.penaltyRecovered;
      a.total += m.totalRecovered;
      rp.set(k, a);
    }
    const recoveryByProvince = [...rp.values()].sort((a, b) => b.total - a.total);
    movement = {
      newCount: nl.length, newAmount: sum(nl, (m) => m.newOutstanding),
      closedCount: closed.length, closedAmount: sum(closed, (m) => m.oldOutstanding),
      topupCount: topups.length, topupAmount: sum(topups, (m) => m.balanceChange),
      repaymentCount: repay.length, repaymentAmount: -sum(repay, (m) => m.balanceChange),
      provisionUp: sum(moves.filter((m) => m.provisionChange > 0), (m) => m.provisionChange),
      provisionDown: -sum(moves.filter((m) => m.provisionChange < 0), (m) => m.provisionChange),
      opening: recon.reduce((s, r) => s + r.opening, 0),
      closing: recon.reduce((s, r) => s + r.closing, 0),
      recoveryByProvince,
      recoveryTotal: recoveryByProvince.reduce(
        (s, r) => ({ principal: s.principal + r.principal, interest: s.interest + r.interest, penalty: s.penalty + r.penalty, total: s.total + r.total }),
        { principal: 0, interest: 0, penalty: 0, total: 0 },
      ),
    };
  }

  // Concentration: group by borrower name
  const byBorrower = new Map<string, LoanPosition[]>();
  for (const l of cur) byBorrower.set(l.borrower, [...(byBorrower.get(l.borrower) ?? []), l]);
  const topBorrowers = [...byBorrower.entries()]
    .map(([borrower, ls]) => ({
      borrower,
      accounts: ls.length,
      branches: [...new Set(ls.map((l) => l.branch.replace(/^\d{3}-/, "")))].join(", "),
      outstanding: ls.reduce((s, l) => s + outstanding(l), 0),
      share: 0,
      worstDpd: Math.max(...ls.map((l) => l.dpd)),
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 20)
    .map((x) => ({ ...x, share: t.outstanding ? x.outstanding / t.outstanding : 0 }));

  // Slippage to the next fiscal quarter end
  const day = snapshotDay(ctx.current.asOf);
  const nextEnd = upcomingPeriodEnds(day)[0];
  const slipRows = nextEnd ? projectProvision(cur, ctx.current.asOf, nextEnd.date).sort((a, b) => b.additional - a.additional) : [];

  // Budget
  let budget: ReportData["budget"] = null;
  if (sections.has("budget")) {
    const bs = toBs(day);
    const targets = await prisma.budgetTarget.findMany({
      where: { fiscalYear: bs.fiscalYear, month: bs.fiscalMonth },
      include: { branch: { include: { province: true } } },
    });
    if (targets.length) {
      const allowedBranches = new Set(ctx.positions.map((l) => l.branch));
      const tgt = new Map<string, number>();
      for (const x of targets) {
        if (ctx.scope.kind !== "all" && !allowedBranches.has(x.branch.name)) continue;
        if (params.branch && x.branch.name !== params.branch) continue;
        if (params.province && x.branch.province?.name !== params.province) continue;
        const k = x.branch.province?.name ?? "Unassigned";
        tgt.set(k, (tgt.get(k) ?? 0) + toPaisa(x.amount));
      }
      const act = new Map<string, number>();
      for (const s of summarize(cur, (l) => l.province ?? "Unassigned")) act.set(s.key, s.outstanding);
      budget = {
        fiscalYear: bs.fiscalYear,
        month: fiscalMonthName(bs.fiscalMonth),
        rows: [...tgt.entries()]
          .map(([key, target]) => ({ key, target, actual: act.get(key) ?? 0, achievement: target ? (act.get(key) ?? 0) / target : null }))
          .sort((a, b) => b.target - a.target),
      };
    }
  }

  // Highlights (plain-language executive summary)
  const h: string[] = [];
  if (p) {
    const d = t.outstanding - p.outstanding;
    h.push(`Loan outstanding ${d >= 0 ? "increased" : "decreased"} by Rs. ${formatCompactNPR(Math.abs(d))} (${pct(p.outstanding ? Math.abs(d) / p.outstanding : 0)}) to Rs. ${formatCompactNPR(t.outstanding)} across ${t.accounts.toLocaleString("en-IN")} loans.`);
    const dn = (t.nplRatio - p.nplRatio) * 100;
    h.push(`Non-performing loans (over 90 DPD) are ${pct(t.nplRatio)} of outstanding, ${Math.abs(dn) < 0.005 ? "unchanged" : `${dn > 0 ? "up" : "down"} ${Math.abs(dn).toFixed(2)} percentage points`}.`);
    const dp = t.provision - p.provision;
    h.push(`Required loan-loss provision is Rs. ${formatCompactNPR(t.provision)} (${pct(t.outstanding ? t.provision / t.outstanding : 0)} coverage), ${dp >= 0 ? "an increase" : "a release"} of Rs. ${formatCompactNPR(Math.abs(dp))}.`);
  } else {
    h.push(`Loan outstanding is Rs. ${formatCompactNPR(t.outstanding)} across ${t.accounts.toLocaleString("en-IN")} loans; NPL ratio ${pct(t.nplRatio)}; required provision Rs. ${formatCompactNPR(t.provision)}.`);
  }
  if (movement) {
    h.push(`${movement.newCount} new loan${movement.newCount === 1 ? "" : "s"} (Rs. ${formatCompactNPR(movement.newAmount)}) and ${movement.closedCount} closure${movement.closedCount === 1 ? "" : "s"} (Rs. ${formatCompactNPR(movement.closedAmount)}); total recovery Rs. ${formatCompactNPR(movement.recoveryTotal.total)}.`);
  }
  h.push(`Principal overdue stands at Rs. ${formatCompactNPR(t.principalOverdue)} (${pct(t.overdueRatio)} of outstanding) with Rs. ${formatCompactNPR(t.interestDue)} of interest due.`);
  if (nextEnd && slipRows.length) {
    h.push(`${slipRows.length} loans will move to a worse class by ${nextEnd.label} unless repaid, requiring an extra Rs. ${formatCompactNPR(slipRows.reduce((s, r) => s + r.additional, 0))} of provision.`);
  }
  if (topBorrowers.length) {
    const top10 = topBorrowers.slice(0, 10).reduce((s, b) => s + b.outstanding, 0);
    h.push(`The 10 largest borrowers account for ${pct(t.outstanding ? top10 / t.outstanding : 0)} of the portfolio.`);
  }

  const overrides = await activeOverrides(ctx.scope, ctx.current.asOf);

  return {
    title: params.title?.trim() || "Loan Portfolio Report",
    scopeLabel,
    asOf: ctx.current.asOf,
    previousAsOf: prev ? (ctx.previous?.asOf ?? null) : null,
    generatedAt: new Date(),
    preparedBy: ctx.user.fullName,
    sections,
    includeStaff,
    totals: t,
    previousTotals: p,
    highlights: h,
    trend: sections.has("trend") ? await portfolioTrend(trendScope(ctx), { includeStaff }) : [],
    byProvince: summarize(cur, (l) => l.province ?? "Unassigned"),
    byBranch: summarize(cur, (l) => l.branch),
    byProduct: summarize(cur, (l) => l.product),
    movement,
    topBorrowers,
    slippage: { target: nextEnd?.label ?? "", count: slipRows.length, additional: slipRows.reduce((s, r) => s + r.additional, 0), rows: slipRows.slice(0, 25) },
    overridesTotal: overrides.reduce((s, o) => s + o.amount, 0),
    budget,
  };
}
