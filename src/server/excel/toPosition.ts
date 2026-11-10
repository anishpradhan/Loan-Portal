import type { LoanPosition } from "@/domain/loan";
import { parseAccountNumber } from "@/domain/loan";
import { toPaisa } from "@/domain/money";
import type { RawLoanRow } from "./masterList";

/** Products whose names start with "Staff" are excluded from provisioning by default. */
export function isStaffProduct(product: string): boolean {
  return /^staff\b/i.test(product.trim());
}

export function rawToPosition(
  r: RawLoanRow,
  opts: { province?: string | null; excludeFromProvisioning?: boolean } = {},
): LoanPosition {
  return {
    accountNumber: r.accountNumber,
    branch: r.branch,
    branchCode: r.branch.slice(0, 3) || parseAccountNumber(r.accountNumber).branchCode,
    province: opts.province ?? null,
    product: r.product,
    excludeFromProvisioning: opts.excludeFromProvisioning ?? isStaffProduct(r.product),
    borrower: r.borrower,
    openingDate: r.openingDate,
    maturityDate: r.maturityDate,
    interestRate: r.interestRate,
    penalRate: r.penalRate,
    granted: toPaisa(r.granted),
    principal: toPaisa(r.principal),
    interestPaid: toPaisa(r.interestPaid),
    penalChargePaid: toPaisa(r.penalChargePaid),
    principalPaid: toPaisa(r.principalPaid),
    principalBalance: toPaisa(r.principalBalance),
    installmentAmount: toPaisa(r.installmentAmount),
    penalBalance: toPaisa(r.penalBalance),
    interestBalance: toPaisa(r.interestBalance),
    chargeBalance: toPaisa(r.chargeBalance),
    overduePrincipal: toPaisa(r.overduePrincipal),
    overdueInterest: toPaisa(r.overdueInterest),
    dpd: r.dpd,
    term: r.term,
    lastTransactionDate: r.lastTransactionDate,
    frequency: r.frequency,
    accruedInterest: toPaisa(r.accruedInterest),
    accruedPenalty: toPaisa(r.accruedPenalty),
  };
}
