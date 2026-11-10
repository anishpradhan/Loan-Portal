import {
  dailyInterest,
  interestDue,
  outstanding,
  penaltyDue,
  provisionFor,
  type LoanPosition,
} from "./loan";
import type { Paisa } from "./money";
import { PROVISION_BUCKETS, type LoanClass } from "./provisioning";

/**
 * Portfolio summaries (sheets "Loan Status Reports", "Rank", "Cross Tab Analysis").
 */
export interface PortfolioSummary {
  key: string;
  accounts: number;
  borrowers: number;
  disbursed: Paisa;
  outstanding: Paisa;
  principalOverdue: Paisa;
  interestDue: Paisa;
  penaltyDue: Paisa;
  accruedInterest: Paisa;
  accruedPenalty: Paisa;
  provision: Paisa;
  provisionByClass: Record<LoanClass, Paisa>;
  outstandingByClass: Record<LoanClass, Paisa>;
  countByClass: Record<LoanClass, number>;
  /** outstanding-weighted average interest rate, % p.a. */
  yieldRate: number;
  dailyInterest: Paisa;
  /** share of the grand total outstanding (0..1) */
  weight: number;
  /** principal overdue / outstanding */
  overdueRatio: number;
  /** (substandard + doubtful + bad) outstanding / outstanding */
  nplRatio: number;
}

function emptyByClass<T>(v: T): Record<LoanClass, T> {
  return Object.fromEntries(PROVISION_BUCKETS.map((b) => [b.cls, v])) as Record<LoanClass, T>;
}

export function summarize(
  rows: readonly LoanPosition[],
  keyOf: (l: LoanPosition) => string,
): PortfolioSummary[] {
  const groups = new Map<string, LoanPosition[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const result = [...groups.entries()].map(([key, items]) => summarizeGroup(key, items));
  const grand = result.reduce((s, r) => s + r.outstanding, 0);
  for (const r of result) r.weight = grand ? r.outstanding / grand : 0;
  return result.sort((a, b) => b.outstanding - a.outstanding);
}

export function summarizeGroup(key: string, items: readonly LoanPosition[]): PortfolioSummary {
  const s: PortfolioSummary = {
    key,
    accounts: items.length,
    borrowers: new Set(items.map((i) => i.borrower)).size,
    disbursed: 0,
    outstanding: 0,
    principalOverdue: 0,
    interestDue: 0,
    penaltyDue: 0,
    accruedInterest: 0,
    accruedPenalty: 0,
    provision: 0,
    provisionByClass: emptyByClass(0),
    outstandingByClass: emptyByClass(0),
    countByClass: emptyByClass(0),
    yieldRate: 0,
    dailyInterest: 0,
    weight: 1,
    overdueRatio: 0,
    nplRatio: 0,
  };
  let weightedRate = 0;
  for (const l of items) {
    const out = outstanding(l);
    s.disbursed += l.principal;
    s.outstanding += out;
    s.principalOverdue += l.overduePrincipal;
    s.interestDue += interestDue(l);
    s.penaltyDue += penaltyDue(l);
    s.accruedInterest += l.accruedInterest;
    s.accruedPenalty += l.accruedPenalty;
    s.dailyInterest += dailyInterest(l);
    weightedRate += Math.abs(out) * l.interestRate;
    const p = provisionFor(l);
    s.outstandingByClass[p.cls] += out;
    s.countByClass[p.cls] += 1;
    if (!l.excludeFromProvisioning) {
      s.provision += p.amount;
      s.provisionByClass[p.cls] += p.amount;
    }
  }
  const absOut = items.reduce((t, l) => t + Math.abs(outstanding(l)), 0);
  s.yieldRate = absOut ? weightedRate / absOut : 0;
  s.overdueRatio = s.outstanding ? s.principalOverdue / s.outstanding : 0;
  const npl = s.outstandingByClass.SUBSTANDARD + s.outstandingByClass.DOUBTFUL + s.outstandingByClass.BAD;
  s.nplRatio = s.outstanding ? npl / s.outstanding : 0;
  return s;
}

export function total(rows: readonly LoanPosition[]): PortfolioSummary {
  return summarizeGroup("Total", rows);
}
