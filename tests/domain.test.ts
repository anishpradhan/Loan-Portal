import { describe, expect, it } from "vitest";
import { formatNPR, toPaisa } from "@/domain/money";
import { bucketFor, provisionAmount, provisionRate } from "@/domain/provisioning";
import { toBs } from "@/domain/nepali";
import { compareSnapshots, reconcileByBranch } from "@/domain/movement";
import type { LoanPosition } from "@/domain/loan";

describe("provisioning policy", () => {
  it.each([
    [0, 0.01], [90, 0.01], [91, 0.25], [182, 0.25], [183, 0.5], [365, 0.5], [366, 1], [2000, 1],
  ])("DPD %i → %f", (dpd, rate) => expect(provisionRate(dpd)).toBe(rate));

  it("fractional DPD just over a boundary moves to the next bucket", () => {
    expect(bucketFor(90.4).cls).toBe("SUBSTANDARD");
  });

  it("computes amounts in paisa", () => {
    expect(provisionAmount(toPaisa(-1_000_000), 100)).toBe(toPaisa(250_000));
  });
});

describe("money", () => {
  it("formats with Nepali grouping", () => {
    expect(formatNPR(toPaisa(12345678.9))).toBe("1,23,45,678.90");
    expect(formatNPR(toPaisa(-999))).toBe("-999.00");
  });
});

describe("Nepali calendar", () => {
  it("maps Kartik to fiscal month 4", () => {
    const bs = toBs(new Date(2026, 10, 5));
    expect(bs.fiscalYear).toBe("2083/84");
    expect(bs.fiscalMonth).toBe(4);
  });
});

function loan(acc: string, balance: number, extra: Partial<LoanPosition> = {}): LoanPosition {
  return {
    accountNumber: acc, branch: "001-Main Branch", branchCode: "001", province: "Bagmati",
    product: "Institutional Loan(71)", excludeFromProvisioning: false, borrower: "X",
    openingDate: null, maturityDate: null, interestRate: 10, penalRate: 2, granted: 0,
    principal: 0, interestPaid: 0, penalChargePaid: 0, principalPaid: 0,
    principalBalance: toPaisa(-balance), installmentAmount: 0, penalBalance: 0,
    interestBalance: 0, chargeBalance: 0, overduePrincipal: 0, overdueInterest: 0, dpd: 0,
    term: 0, lastTransactionDate: null, frequency: null, accruedInterest: 0, accruedPenalty: 0,
    ...extra,
  };
}

describe("snapshot movement", () => {
  it("classifies and reconciles", () => {
    const oldRows = [loan("A", 100), loan("B", 100), loan("C", 100)];
    const newRows = [loan("A", 80), loan("B", 150, { dpd: 120 }), loan("D", 50)];
    const m = Object.fromEntries(compareSnapshots(oldRows, newRows).map((x) => [x.accountNumber, x]));
    expect(m.A.type).toBe("REPAYMENT");
    expect(m.B.type).toBe("TOP_UP");
    expect(m.B.newClass).toBe("SUBSTANDARD");
    expect(m.C.type).toBe("CLOSED");
    expect(m.D.type).toBe("NEW");
    expect(reconcileByBranch(Object.values(m))[0].difference).toBe(0);
  });
});
