import type { PortfolioSummary } from "@/domain/aggregate";
import type { LoanPosition } from "@/domain/loan";
import { formatCompactNPR } from "@/domain/money";

/**
 * Staff loans are excluded from portfolio analytics by default (the workbook's
 * Report sheet does the same). ?staff=1 includes them.
 */
export function applyStaffFilter(rows: LoanPosition[], params: Record<string, string>): LoanPosition[] {
  return params.staff === "1" ? rows : rows.filter((r) => !r.excludeFromProvisioning);
}

export function moneyDelta(cur: number, prev: number | null | undefined) {
  if (prev === null || prev === undefined) return null;
  const d = cur - prev;
  const pct = prev ? ` (${((d / Math.abs(prev)) * 100).toFixed(2)}%)` : "";
  return {
    text: `${d >= 0 ? "+" : "-"}${formatCompactNPR(Math.abs(d))}${pct}`,
    direction: d > 0 ? ("up" as const) : d < 0 ? ("down" as const) : ("flat" as const),
  };
}

export function ratioDelta(cur: number, prev: number | null | undefined) {
  if (prev === null || prev === undefined) return null;
  const d = (cur - prev) * 100;
  return {
    text: `${d >= 0 ? "+" : ""}${d.toFixed(2)} pp`,
    direction: Math.abs(d) < 0.005 ? ("flat" as const) : d > 0 ? ("up" as const) : ("down" as const),
  };
}

export function countDelta(cur: number, prev: number | null | undefined) {
  if (prev === null || prev === undefined) return null;
  const d = cur - prev;
  return { text: `${d >= 0 ? "+" : ""}${d.toLocaleString("en-IN")}`, direction: d > 0 ? ("up" as const) : d < 0 ? ("down" as const) : ("flat" as const) };
}

/** Flat rows for summary tables (portfolio page and report). */
export function summaryRows(s: PortfolioSummary[]) {
  return s.map((x) => ({
    key: x.key,
    accounts: x.accounts,
    borrowers: x.borrowers,
    outstanding: x.outstanding,
    weight: x.weight,
    principalOverdue: x.principalOverdue,
    overdueRatio: x.overdueRatio,
    interestDue: x.interestDue,
    penaltyDue: x.penaltyDue,
    npl: x.nplRatio,
    provision: x.provision,
    yieldRate: x.yieldRate,
  }));
}

