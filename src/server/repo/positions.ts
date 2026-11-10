import "server-only";
import type { LoanSnapshotRow, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { LoanPosition } from "@/domain/loan";
import { toPaisa } from "@/domain/money";
import { inScope, type Scope } from "@/server/auth/scope";

/**
 * Repository for loan positions. Snapshots are immutable, so each one is
 * loaded once and kept in memory (a few MB each); scoping is applied after.
 */
const MAX_CACHED = 8;
const cache = new Map<number, Promise<LoanPosition[]>>();

export function invalidateSnapshotCache() {
  cache.clear();
}

async function loadSnapshot(snapshotId: number): Promise<LoanPosition[]> {
  const rows = await prisma.loanSnapshotRow.findMany({
    where: { snapshotId },
    include: {
      account: {
        include: {
          branch: { include: { province: true } },
          product: true,
          borrower: true,
        },
      },
    },
  });
  return rows.map((r) => mapRow(r, r.account));
}


type AccountWithRefs = Prisma.LoanAccountGetPayload<{
  include: { branch: { include: { province: true } }; product: true; borrower: true };
}>;

/** DB row + account → domain LoanPosition (Decimal → paisa). */
export function mapRow(r: LoanSnapshotRow, account: AccountWithRefs): LoanPosition {
  return {
    accountNumber: account.accountNumber,
    branch: account.branch.name,
    branchCode: account.branch.code,
    province: account.branch.province?.name ?? null,
    product: account.product.name,
    excludeFromProvisioning: account.product.excludeFromProvisioning,
    borrower: account.borrower.name,
    openingDate: account.openingDate,
    maturityDate: account.maturityDate,
    interestRate: Number(r.interestRate),
    penalRate: Number(r.penalRate),
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

export async function getPositions(snapshotId: number, scope: Scope): Promise<LoanPosition[]> {
  let p = cache.get(snapshotId);
  if (!p) {
    p = loadSnapshot(snapshotId);
    cache.set(snapshotId, p);
    p.catch(() => cache.delete(snapshotId));
    while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  }
  const all = await p;
  return scope.kind === "all" ? all : all.filter((l) => inScope(scope, l));
}

export interface SnapshotInfo {
  id: number;
  asOf: Date;
  rowCount: number;
  sourceFile: string;
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return prisma.snapshot.findMany({
    orderBy: { asOf: "desc" },
    select: { id: true, asOf: true, rowCount: true, sourceFile: true },
  });
}

/**
 * Resolves the snapshot pair for a page from ?s= (current) and ?vs= (comparison).
 * Defaults: latest, and the one before it.
 */
export async function resolveSnapshots(params: { s?: string; vs?: string }) {
  const all = await listSnapshots();
  const current = all.find((x) => String(x.id) === params.s) ?? all[0] ?? null;
  const older = current ? all.filter((x) => x.asOf < current.asOf) : [];
  const previous = all.find((x) => String(x.id) === params.vs && current && x.asOf < current.asOf) ?? older[0] ?? null;
  return { all, current, previous };
}
