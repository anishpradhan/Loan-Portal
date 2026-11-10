import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { Scope } from "@/server/auth/scope";
import { PROVISION_BUCKETS } from "@/domain/provisioning";

export interface TrendPoint {
  snapshotId: number;
  asOf: Date;
  accounts: number;
  outstanding: number; // paisa, positive
  principalOverdue: number; // paisa
  npl: number; // paisa outstanding with DPD > 90
  provision: number; // paisa
}

/**
 * Portfolio totals for every snapshot, aggregated in SQL so the trend stays
 * fast however many snapshots accumulate. The CASE mirrors PROVISION_BUCKETS.
 */
export async function portfolioTrend(scope: Scope, opts: { includeStaff?: boolean; limit?: number } = {}): Promise<TrendPoint[]> {
  const limit = opts.limit ?? 36;
  const staffSql = opts.includeStaff ? Prisma.empty : Prisma.sql`AND NOT p."excludeFromProvisioning"`;
  const scopeSql =
    scope.kind === "branch"
      ? Prisma.sql`AND b.code = ${scope.branchCode}`
      : scope.kind === "province"
        ? Prisma.sql`AND pv.name = ${scope.province}`
        : Prisma.empty;

  const [pass, sub, dbt] = PROVISION_BUCKETS;
  const rows = await prisma.$queryRaw<
    { id: number; asOf: Date; accounts: bigint; outstanding: string; od: string; npl: string; provision: string }[]
  >`
    SELECT s.id, s."asOf",
      COUNT(r.id) AS accounts,
      COALESCE(SUM(-r."principalBalance"), 0)::text AS outstanding,
      COALESCE(SUM(r."overduePrincipal"), 0)::text AS od,
      COALESCE(SUM(CASE WHEN r.dpd > ${pass.maxDpd} THEN -r."principalBalance" ELSE 0 END), 0)::text AS npl,
      COALESCE(SUM(CASE WHEN p."excludeFromProvisioning" THEN 0 ELSE
        ABS(r."principalBalance") * CASE
          WHEN r.dpd <= ${pass.maxDpd} THEN ${pass.rate}
          WHEN r.dpd <= ${sub.maxDpd} THEN ${sub.rate}
          WHEN r.dpd <= ${dbt.maxDpd} THEN ${dbt.rate}
          ELSE ${PROVISION_BUCKETS[3].rate} END
      END), 0)::text AS provision
    FROM "Snapshot" s
    JOIN "LoanSnapshotRow" r ON r."snapshotId" = s.id
    JOIN "LoanAccount" a ON a.id = r."accountId"
    JOIN "Product" p ON p.id = a."productId"
    JOIN "Branch" b ON b.id = a."branchId"
    LEFT JOIN "Province" pv ON pv.id = b."provinceId"
    WHERE true ${scopeSql} ${staffSql}
    GROUP BY s.id, s."asOf"
    ORDER BY s."asOf" DESC
    LIMIT ${limit}
  `;
  return rows
    .map((r) => ({
      snapshotId: r.id,
      asOf: r.asOf,
      accounts: Number(r.accounts),
      outstanding: Math.round(Number(r.outstanding) * 100),
      principalOverdue: Math.round(Number(r.od) * 100),
      npl: Math.round(Number(r.npl) * 100),
      provision: Math.round(Number(r.provision) * 100),
    }))
    .reverse();
}
