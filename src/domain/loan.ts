import { mulRate, type Paisa } from "./money";
import { bucketFor, provisionAmount, type LoanClass } from "./provisioning";

/**
 * One loan as of one snapshot, in the core-banking sign convention
 * (balances owed by the borrower are negative). Money in paisa.
 */
export interface LoanPosition {
  accountNumber: string;
  branch: string; // "001-Main Branch"
  branchCode: string; // "001"
  province: string | null;
  product: string;
  excludeFromProvisioning: boolean;
  borrower: string;
  openingDate: Date | null;
  maturityDate: Date | null;
  interestRate: number; // % per annum, e.g. 9.5
  penalRate: number;
  granted: Paisa;
  principal: Paisa; // disbursed principal
  interestPaid: Paisa;
  penalChargePaid: Paisa;
  principalPaid: Paisa;
  principalBalance: Paisa; // negative = owed
  installmentAmount: Paisa;
  penalBalance: Paisa;
  interestBalance: Paisa;
  chargeBalance: Paisa;
  overduePrincipal: Paisa;
  overdueInterest: Paisa;
  dpd: number;
  term: number;
  lastTransactionDate: Date | null;
  frequency: string | null;
  accruedInterest: Paisa;
  accruedPenalty: Paisa;
}

export const CORPORATE_OFFICE = "000-Corporate Office";
const DAILY_PENALTY_RATE = 0.02; // 2% p.a. on overdue principal
const PENALTY_GRACE_DPD = 15;

/** Outstanding principal as a positive amount. */
export function outstanding(l: Pick<LoanPosition, "principalBalance">): Paisa {
  return -l.principalBalance;
}

export interface AccountNumberParts {
  branchCode: string;
  chartCode: string;
  serial: string;
}

/** 15-digit account number = branch(3) + chart of account(5) + serial(7). */
export function parseAccountNumber(acc: string): AccountNumberParts {
  const a = acc.trim();
  return { branchCode: a.slice(0, 3), chartCode: a.slice(3, 8), serial: a.slice(-7) };
}

/** Amount required to close the loan today (Report!AA). */
export function requiredToClose(l: LoanPosition): Paisa {
  // Workbook: O + N - M - L - J  with source signs
  // = accruedPenalty + accruedInterest - penalBalance - interestBalance - principalBalance
  return l.accruedPenalty + l.accruedInterest - l.penalBalance - l.interestBalance - l.principalBalance;
}

/** Interest accruing per day on the outstanding principal (Report!AB). */
export function dailyInterest(l: LoanPosition): Paisa {
  return Math.abs(mulRate(l.principalBalance, l.interestRate / 36500));
}

/** Penalty accruing per day (Report!AC): 2% p.a. on overdue principal after 15 DPD. */
export function dailyPenalty(l: LoanPosition): Paisa {
  if (l.dpd < PENALTY_GRACE_DPD || l.branch === CORPORATE_OFFICE) return 0;
  return Math.abs(mulRate(l.overduePrincipal, DAILY_PENALTY_RATE / 365));
}

/**
 * DPD implied by unpaid interest (sheet "LLP as Per IR"):
 * max(reported DPD, interest due / daily interest). Not rounded, so that
 * 90.4 days falls into the 25% bucket exactly as in the workbook.
 */
export function effectiveDpd(l: LoanPosition): number {
  const perDay = (Math.abs(l.principalBalance) * l.interestRate) / 36500;
  if (!perDay) return l.dpd;
  const implied = Math.abs(l.interestBalance) / perDay;
  return Math.max(l.dpd, implied);
}

/** Interest due (the workbook's "Interest OD"), positive. */
export function interestDue(l: LoanPosition): Paisa {
  return Math.abs(l.interestBalance);
}

/** Penalty due (the workbook's "Penal OD"), positive. */
export function penaltyDue(l: LoanPosition): Paisa {
  return Math.abs(l.penalBalance);
}

/** DPD projected to a future date assuming nothing is paid (LLP Review Module). */
export function projectedDpd(l: Pick<LoanPosition, "dpd">, asOf: Date, target: Date): number {
  const days = Math.floor((startOfDay(target).getTime() - startOfDay(asOf).getTime()) / 86_400_000);
  return l.dpd + Math.max(0, days);
}

export interface ProvisionView {
  cls: LoanClass;
  rate: number;
  amount: Paisa;
}

export function provisionFor(l: LoanPosition, dpd = l.dpd): ProvisionView {
  const b = bucketFor(dpd);
  return { cls: b.cls, rate: b.rate, amount: provisionAmount(outstanding(l), dpd) };
}

export function isProvisionable(l: LoanPosition): boolean {
  return !l.excludeFromProvisioning;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
