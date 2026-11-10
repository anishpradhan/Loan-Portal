import "server-only";
import { prisma } from "@/server/db";
import { accountWhere, type Scope } from "@/server/auth/scope";
import {
  effectiveDpd,
  outstanding,
  projectedDpd,
  provisionFor,
  type LoanPosition,
} from "@/domain/loan";
import { toPaisa } from "@/domain/money";
import { bucketFor, PROVISION_BUCKETS, type LoanClass } from "@/domain/provisioning";
import { snapshotDay } from "@/lib/dates";

export interface ProjectionRow {
  accountNumber: string;
  borrower: string;
  branch: string;
  product: string;
  outstanding: number;
  dpd: number;
  projectedDpd: number;
  cls: LoanClass;
  projectedCls: LoanClass;
  provision: number;
  projectedProvision: number;
  additional: number;
}

/** Loans that will move into a worse class by `target` if they stay unpaid (LLP Review Module). */
export function projectProvision(rows: LoanPosition[], asOf: Date, target: Date): ProjectionRow[] {
  const day = snapshotDay(asOf);
  return rows
    .filter((l) => !l.excludeFromProvisioning && outstanding(l) > 0)
    .map((l) => {
      const now = provisionFor(l);
      const pd = projectedDpd(l, day, target);
      const then = provisionFor(l, pd);
      return {
        accountNumber: l.accountNumber,
        borrower: l.borrower,
        branch: l.branch,
        product: l.product,
        outstanding: outstanding(l),
        dpd: l.dpd,
        projectedDpd: pd,
        cls: now.cls,
        projectedCls: then.cls,
        provision: now.amount,
        projectedProvision: then.amount,
        additional: then.amount - now.amount,
      };
    })
    .filter((r) => r.cls !== r.projectedCls);
}

/** Loans whose unpaid interest implies a worse class than the reported DPD ("LLP as Per IR"). */
export function irBasedGaps(rows: LoanPosition[]) {
  return rows
    .filter((l) => !l.excludeFromProvisioning && outstanding(l) > 0)
    .map((l) => {
      const ed = effectiveDpd(l);
      const now = provisionFor(l);
      const ir = provisionFor(l, ed);
      return {
        accountNumber: l.accountNumber,
        borrower: l.borrower,
        branch: l.branch,
        outstanding: outstanding(l),
        interestDue: Math.abs(l.interestBalance),
        dpd: l.dpd,
        irDpd: Math.round(ed),
        cls: now.cls,
        irCls: ir.cls,
        provision: now.amount,
        irProvision: ir.amount,
        additional: ir.amount - now.amount,
      };
    })
    .filter((r) => r.irCls !== r.cls);
}

/** Class migration between two snapshots: matrix[from][to] = { count, outstanding }. */
export function migrationMatrix(prev: LoanPosition[], cur: LoanPosition[]) {
  const prevMap = new Map(prev.map((l) => [l.accountNumber, l]));
  const m = Object.fromEntries(
    PROVISION_BUCKETS.map((a) => [a.cls, Object.fromEntries(PROVISION_BUCKETS.map((b) => [b.cls, { count: 0, outstanding: 0 }]))]),
  ) as Record<LoanClass, Record<LoanClass, { count: number; outstanding: number }>>;
  for (const l of cur) {
    const p = prevMap.get(l.accountNumber);
    if (!p) continue;
    const cell = m[bucketFor(p.dpd).cls][bucketFor(l.dpd).cls];
    cell.count++;
    cell.outstanding += outstanding(l);
  }
  return m;
}

export async function activeOverrides(scope: Scope, asOf: Date) {
  const rows = await prisma.provisionOverride.findMany({
    where: {
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
      account: accountWhere(scope),
    },
    include: { account: { include: { borrower: true, branch: true } }, createdBy: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((o) => ({
    id: o.id,
    accountNumber: o.account.accountNumber,
    borrower: o.account.borrower.name,
    branch: o.account.branch.name,
    amount: toPaisa(o.amount),
    reason: o.reason,
    effectiveFrom: o.effectiveFrom.toISOString(),
    createdBy: o.createdBy?.fullName ?? "",
  }));
}
