import { mulRate, type Paisa } from "./money";

/**
 * Loan-loss provisioning (LLP) policy: classification by days past due.
 * Mirrors the workbook rule IFS(dpd<=90,1%, dpd<=182,25%, dpd<=365,50%, dpd>365,100%).
 * Change the policy here only; every screen and report reads from it.
 */
export type LoanClass = "PASS" | "SUBSTANDARD" | "DOUBTFUL" | "BAD";

export interface ProvisionBucket {
  cls: LoanClass;
  label: string;
  maxDpd: number; // inclusive upper bound
  rate: number;
}

export const PROVISION_BUCKETS: readonly ProvisionBucket[] = [
  { cls: "PASS", label: "Pass", maxDpd: 90, rate: 0.01 },
  { cls: "SUBSTANDARD", label: "Substandard", maxDpd: 182, rate: 0.25 },
  { cls: "DOUBTFUL", label: "Doubtful", maxDpd: 365, rate: 0.5 },
  { cls: "BAD", label: "Bad", maxDpd: Number.POSITIVE_INFINITY, rate: 1.0 },
] as const;

export function bucketFor(dpd: number): ProvisionBucket {
  const d = Number.isFinite(dpd) ? dpd : 0;
  return PROVISION_BUCKETS.find((b) => d <= b.maxDpd) ?? PROVISION_BUCKETS[PROVISION_BUCKETS.length - 1];
}

export function provisionRate(dpd: number): number {
  return bucketFor(dpd).rate;
}

/** Required provision for an outstanding principal (positive paisa). */
export function provisionAmount(outstanding: Paisa, dpd: number): Paisa {
  return mulRate(Math.abs(outstanding), provisionRate(dpd));
}

export function bucketLabel(cls: LoanClass): string {
  return PROVISION_BUCKETS.find((b) => b.cls === cls)?.label ?? cls;
}
