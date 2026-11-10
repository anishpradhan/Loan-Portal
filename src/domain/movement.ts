import { CORPORATE_OFFICE, outstanding, type LoanPosition } from "./loan";
import type { Paisa } from "./money";
import { bucketFor, provisionAmount, type LoanClass } from "./provisioning";

/**
 * Comparison of two snapshots (sheets "Credit Movement", "Recovery Analysis",
 * "DPD Mismatch"). Every loan in either snapshot gets exactly one movement type.
 */
export type MovementType = "NEW" | "CLOSED" | "TOP_UP" | "REPAYMENT" | "UNCHANGED";

export interface LoanMovement {
  accountNumber: string;
  branch: string;
  province: string | null;
  product: string;
  borrower: string;
  type: MovementType;
  oldOutstanding: Paisa;
  newOutstanding: Paisa;
  /** new - old outstanding; positive = loan grew */
  balanceChange: Paisa;
  oldDpd: number | null;
  newDpd: number | null;
  oldClass: LoanClass | null;
  newClass: LoanClass | null;
  oldProvision: Paisa;
  newProvision: Paisa;
  /** new - old provision; positive = more provision required */
  provisionChange: Paisa;
  principalRecovered: Paisa;
  interestRecovered: Paisa;
  penaltyRecovered: Paisa;
  totalRecovered: Paisa;
  excludeFromProvisioning: boolean;
}

export interface MovementOptions {
  /** DPD increase above which a loan is flagged (sheet "DPD Mismatch", default 3). */
  dpdJumpTolerance?: number;
}

export function compareSnapshots(
  oldRows: readonly LoanPosition[],
  newRows: readonly LoanPosition[],
): LoanMovement[] {
  const oldMap = new Map(oldRows.map((r) => [r.accountNumber, r]));
  const newMap = new Map(newRows.map((r) => [r.accountNumber, r]));
  const accounts = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
  const out: LoanMovement[] = [];

  for (const acc of accounts) {
    const o = oldMap.get(acc);
    const n = newMap.get(acc);
    const ref = (n ?? o)!;
    const oldOut = o ? outstanding(o) : 0;
    const newOut = n ? outstanding(n) : 0;
    const provisionable = !ref.excludeFromProvisioning;
    const oldProv = o && provisionable ? provisionAmount(oldOut, o.dpd) : 0;
    const newProv = n && provisionable ? provisionAmount(newOut, n.dpd) : 0;

    let type: MovementType;
    if (!o) type = "NEW";
    else if (!n || newOut === 0) type = "CLOSED";
    else if (newOut > oldOut) type = "TOP_UP";
    else if (newOut < oldOut) type = "REPAYMENT";
    else type = "UNCHANGED";

    const principalRecovered = o && n ? n.principalPaid - o.principalPaid : 0;
    const interestRecovered = o && n ? n.interestPaid - o.interestPaid : 0;
    const penaltyRecovered = o && n ? n.penalChargePaid - o.penalChargePaid : 0;

    out.push({
      accountNumber: acc,
      branch: ref.branch,
      province: ref.province,
      product: ref.product,
      borrower: ref.borrower,
      type,
      oldOutstanding: oldOut,
      newOutstanding: newOut,
      balanceChange: newOut - oldOut,
      oldDpd: o ? o.dpd : null,
      newDpd: n ? n.dpd : null,
      oldClass: o ? bucketFor(o.dpd).cls : null,
      newClass: n ? bucketFor(n.dpd).cls : null,
      oldProvision: oldProv,
      newProvision: newProv,
      provisionChange: newProv - oldProv,
      principalRecovered,
      interestRecovered,
      penaltyRecovered,
      totalRecovered: principalRecovered + interestRecovered + penaltyRecovered,
      excludeFromProvisioning: ref.excludeFromProvisioning,
    });
  }
  return out;
}

/** Loans whose DPD rose by more than the tolerance between snapshots. */
export function dpdJumps(movements: readonly LoanMovement[], opts: MovementOptions = {}): LoanMovement[] {
  const tol = opts.dpdJumpTolerance ?? 3;
  return movements.filter((m) => m.oldDpd !== null && m.newDpd !== null && m.newDpd - m.oldDpd > tol);
}

export interface BranchReconciliation {
  branch: string;
  opening: Paisa;
  newLoans: Paisa;
  topUps: Paisa;
  closed: Paisa;
  repayments: Paisa;
  closing: Paisa;
  /** opening + new + top-ups - closed - repayments - closing; should be 0 */
  difference: Paisa;
}

/** Branch-wise roll-forward of outstanding (Credit Movement BN:BU). */
export function reconcileByBranch(movements: readonly LoanMovement[]): BranchReconciliation[] {
  const by = new Map<string, BranchReconciliation>();
  for (const m of movements) {
    let r = by.get(m.branch);
    if (!r) {
      r = { branch: m.branch, opening: 0, newLoans: 0, topUps: 0, closed: 0, repayments: 0, closing: 0, difference: 0 };
      by.set(m.branch, r);
    }
    r.opening += m.oldOutstanding;
    r.closing += m.newOutstanding;
    if (m.type === "NEW") r.newLoans += m.newOutstanding;
    if (m.type === "TOP_UP") r.topUps += m.balanceChange;
    if (m.type === "CLOSED") r.closed += m.oldOutstanding;
    if (m.type === "REPAYMENT") r.repayments += -m.balanceChange;
  }
  for (const r of by.values()) {
    r.difference = r.opening + r.newLoans + r.topUps - r.closed - r.repayments - r.closing;
  }
  return [...by.values()].sort((a, b) => a.branch.localeCompare(b.branch));
}

/** New loans as the workbook counts them (Corporate Office excluded). */
export function newLoans(movements: readonly LoanMovement[]): LoanMovement[] {
  return movements.filter((m) => m.type === "NEW" && m.branch !== CORPORATE_OFFICE);
}
