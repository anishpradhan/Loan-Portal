import "server-only";
import { prisma } from "@/server/db";
import type { LoanPosition } from "@/domain/loan";
import type { SessionUser } from "./session";

/**
 * Row-level data scope. Every query of loan data goes through a Scope,
 * so a branch manager can never see another branch's loans.
 */
export type Scope =
  | { kind: "all"; label: string }
  | { kind: "province"; province: string; label: string }
  | { kind: "branch"; branchCode: string; label: string };

export async function scopeFor(user: SessionUser): Promise<Scope> {
  if (user.role === "ADMIN" || user.role === "SENIOR") return { kind: "all", label: "All branches" };
  if (user.role === "PROVINCE_MANAGER") {
    const p = user.provinceId ? await prisma.province.findUnique({ where: { id: user.provinceId } }) : null;
    // A misconfigured manager sees nothing rather than everything
    return { kind: "province", province: p?.name ?? "__none__", label: p ? `${p.name} Province` : "No province assigned" };
  }
  const b = user.branchId ? await prisma.branch.findUnique({ where: { id: user.branchId } }) : null;
  return { kind: "branch", branchCode: b?.code ?? "__none__", label: b?.name ?? "No branch assigned" };
}

export function inScope(scope: Scope, l: Pick<LoanPosition, "branchCode" | "province">): boolean {
  switch (scope.kind) {
    case "all":
      return true;
    case "province":
      return l.province === scope.province;
    case "branch":
      return l.branchCode === scope.branchCode;
  }
}

/** Prisma filter for LoanAccount queries. */
export function accountWhere(scope: Scope) {
  switch (scope.kind) {
    case "all":
      return {};
    case "province":
      return { branch: { province: { name: scope.province } } };
    case "branch":
      return { branch: { code: scope.branchCode } };
  }
}
