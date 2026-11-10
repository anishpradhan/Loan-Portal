import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { isMasterListSheet, loadWorkbook, parseMasterListSheet, type ParsedMasterList, type RawLoanRow } from "@/server/excel/masterList";
import { parseBranchDirectory, parseBudget, parseConsolidatedBranchDirectory, type BranchInfo, type BudgetRow } from "@/server/excel/referenceData";
import { isStaffProduct } from "@/server/excel/toPosition";
import { audit } from "@/server/audit";
import { invalidateSnapshotCache } from "@/server/repo/positions";

/**
 * Two-step import: analyse (validate + preview, file kept under an upload token)
 * then commit the parts the user selected. Adapter between Excel files and the DB.
 */

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");

export interface SheetPreview {
  sheetName: string;
  format: ParsedMasterList["format"];
  reportDate: string | null;
  rowCount: number;
  totalRows: number;
  issues: ParsedMasterList["issues"];
  outstanding: number; // NPR, positive
  alreadyImported: boolean;
  branches: number;
}

export interface ImportAnalysis {
  token: string;
  fileName: string;
  sheets: SheetPreview[];
  branchDirectory: { count: number; source: string } | null;
  budget: { rows: number; branches: number; sheetName: string } | null;
}

function checksumFor(buf: Buffer, sheet: string) {
  return createHash("sha256").update(buf).update(`\u0000${sheet}`).digest("hex");
}

async function loadUpload(token: string): Promise<{ buf: Buffer; fileName: string }> {
  if (!/^[0-9a-f-]{36}$/.test(token)) throw new Error("Invalid upload token");
  const meta = JSON.parse(await readFile(path.join(UPLOAD_DIR, `${token}.json`), "utf8")) as { fileName: string };
  return { buf: await readFile(path.join(UPLOAD_DIR, `${token}.bin`)), fileName: meta.fileName };
}

export async function analyseUpload(buf: Buffer, fileName: string): Promise<ImportAnalysis> {
  if (!/\.(xlsx|xlsm)$/i.test(fileName)) throw new Error("Please upload an .xlsx or .xlsm file (save .xls/.csv exports as .xlsx first).");
  const wb = await loadWorkbook(buf);
  const token = randomUUID();
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, `${token}.bin`), buf);
  await writeFile(path.join(UPLOAD_DIR, `${token}.json`), JSON.stringify({ fileName, uploadedAt: new Date() }));

  const sheets: SheetPreview[] = [];
  let budget: ImportAnalysis["budget"] = null;
  let directory: BranchInfo[] | null = null;
  let directorySource = "";

  for (const ws of wb.worksheets) {
    if (isMasterListSheet(ws)) {
      const p = parseMasterListSheet(ws);
      const checksum = checksumFor(buf, ws.name);
      const existing = await prisma.snapshot.findFirst({
        where: { OR: [{ checksum }, ...(p.reportDate ? [{ asOf: p.reportDate }] : [])] },
        select: { id: true },
      });
      sheets.push({
        sheetName: ws.name,
        format: p.format,
        reportDate: p.reportDate?.toISOString() ?? null,
        rowCount: p.rows.length,
        totalRows: p.totalRows,
        issues: p.issues.slice(0, 200),
        outstanding: -p.rows.reduce((s, r) => s + r.principalBalance, 0),
        alreadyImported: !!existing,
        branches: new Set(p.rows.map((r) => r.accountNumber.slice(0, 3))).size,
      });
      continue;
    }
    if (!budget) {
      const b = parseBudget(ws);
      if (b && b.length) budget = { rows: b.length, branches: new Set(b.map((x) => x.branch)).size, sheetName: ws.name };
    }
    if (!directory) {
      const d = parseBranchDirectory(ws);
      if (d && d.length) {
        directory = d;
        directorySource = ws.name;
      }
    }
  }
  if (!directory) {
    const d = parseConsolidatedBranchDirectory(wb);
    if (d.length) {
      directory = d;
      directorySource = "Back End + Recovery Analysis";
    }
  }
  // Oldest first so that snapshots are committed in date order
  sheets.sort((a, b) => (a.reportDate ?? "").localeCompare(b.reportDate ?? ""));
  return {
    token,
    fileName,
    sheets,
    branchDirectory: directory ? { count: directory.length, source: directorySource } : null,
    budget,
  };
}

export interface CommitRequest {
  token: string;
  sheets: { sheetName: string; reportDate?: string | null }[];
  importBranchDirectory: boolean;
  budgetFiscalYear: string | null; // e.g. "2083/84"; null = skip budget
  userId: number;
}

export interface CommitResult {
  snapshots: { id: number; asOf: string; rows: number }[];
  branchesUpdated: number;
  budgetRows: number;
}

export async function commitUpload(req: CommitRequest): Promise<CommitResult> {
  const { buf, fileName } = await loadUpload(req.token);
  const wb = await loadWorkbook(buf);
  const result: CommitResult = { snapshots: [], branchesUpdated: 0, budgetRows: 0 };

  if (req.importBranchDirectory) {
    let dir: BranchInfo[] | null = null;
    for (const ws of wb.worksheets) {
      dir = parseBranchDirectory(ws);
      if (dir?.length) break;
    }
    if (!dir?.length) dir = parseConsolidatedBranchDirectory(wb);
    result.branchesUpdated = await upsertBranchDirectory(dir);
  }

  for (const s of req.sheets) {
    const ws = wb.getWorksheet(s.sheetName);
    if (!ws) throw new Error(`Sheet "${s.sheetName}" not found`);
    const parsed = parseMasterListSheet(ws);
    const asOf = parsed.reportDate ?? (s.reportDate ? new Date(s.reportDate) : null);
    if (!asOf || Number.isNaN(asOf.getTime())) throw new Error(`Sheet "${s.sheetName}" has no report date; please enter one.`);
    const snap = await commitSnapshot({
      rows: parsed.rows,
      asOf,
      sourceFile: `${fileName} › ${s.sheetName}`,
      checksum: checksumFor(buf, s.sheetName),
      userId: req.userId,
    });
    result.snapshots.push({ id: snap.id, asOf: asOf.toISOString(), rows: parsed.rows.length });
  }

  if (req.budgetFiscalYear) {
    for (const ws of wb.worksheets) {
      const b = parseBudget(ws);
      if (b?.length) {
        result.budgetRows = await upsertBudget(b, req.budgetFiscalYear);
        break;
      }
    }
  }

  await audit(req.userId, "import.commit", "upload", req.token, { fileName, ...result });
  invalidateSnapshotCache();
  return result;
}

// ---------------------------------------------------------------------------

async function ensureProvince(tx: Prisma.TransactionClient, name: string | null): Promise<number | null> {
  if (!name) return null;
  const p = await tx.province.upsert({ where: { name }, update: {}, create: { name } });
  return p.id;
}

export async function upsertBranchDirectory(dir: BranchInfo[]): Promise<number> {
  return prisma.$transaction(async (tx) => {
    let n = 0;
    for (const b of dir) {
      const provinceId = await ensureProvince(tx, b.province);
      if (provinceId && (b.provinceEmail || b.provinceManager)) {
        await tx.province.update({
          where: { id: provinceId },
          data: { email: b.provinceEmail ?? undefined, manager: b.provinceManager ?? undefined },
        });
      }
      await tx.branch.upsert({
        where: { code: b.code },
        update: { name: b.name, displayName: b.displayName, email: b.email, provinceId },
        create: { code: b.code, name: b.name, displayName: b.displayName, email: b.email, provinceId },
      });
      n++;
    }
    return n;
  });
}

export async function upsertBudget(rows: BudgetRow[], fiscalYear: string): Promise<number> {
  const branches = await prisma.branch.findMany({ select: { id: true, name: true, code: true } });
  const byName = new Map(branches.map((b) => [b.name, b.id]));
  const byCode = new Map(branches.map((b) => [b.code, b.id]));
  let n = 0;
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      const branchId = byName.get(r.branch) ?? byCode.get(r.branch.slice(0, 3));
      if (!branchId) continue;
      await tx.budgetTarget.upsert({
        where: { branchId_fiscalYear_month: { branchId, fiscalYear, month: r.month } },
        update: { amount: r.amount },
        create: { branchId, fiscalYear, month: r.month, amount: r.amount },
      });
      n++;
    }
  });
  return n;
}

export async function commitSnapshot(input: {
  rows: RawLoanRow[];
  asOf: Date;
  sourceFile: string;
  checksum: string;
  userId: number | null;
}) {
  const { rows, asOf } = input;
  const dup = await prisma.snapshot.findFirst({ where: { OR: [{ checksum: input.checksum }, { asOf }] } });
  if (dup) throw new Error(`A snapshot dated ${asOf.toISOString().slice(0, 16).replace("T", " ")} is already imported.`);

  return prisma.$transaction(
    async (tx) => {
      // Branches (code = first 3 digits of the account number)
      const branchNames = new Map<string, string>();
      for (const r of rows) {
        const code = r.accountNumber.slice(0, 3);
        if (!branchNames.has(code) || /^\d{3}-/.test(r.branch)) branchNames.set(code, r.branch);
      }
      const existingBranches = await tx.branch.findMany();
      const branchId = new Map(existingBranches.map((b) => [b.code, b.id]));
      for (const [code, name] of branchNames) {
        if (branchId.has(code)) continue;
        const full = /^\d{3}-/.test(name) ? name : `${code}-${name}`;
        const b = await tx.branch.create({ data: { code, name: full, displayName: full.replace(/^\d{3}-/, "") } });
        branchId.set(code, b.id);
      }

      // Products
      const products = new Map((await tx.product.findMany()).map((p) => [p.name, p.id]));
      for (const name of new Set(rows.map((r) => r.product))) {
        if (products.has(name)) continue;
        const p = await tx.product.create({ data: { name, excludeFromProvisioning: isStaffProduct(name) } });
        products.set(name, p.id);
      }

      // Accounts (and borrowers for new accounts)
      const accounts = new Map(
        (await tx.loanAccount.findMany({ select: { id: true, accountNumber: true, borrowerId: true } })).map((a) => [a.accountNumber, a]),
      );
      for (const r of rows) {
        const existing = accounts.get(r.accountNumber);
        const data = {
          branchId: branchId.get(r.accountNumber.slice(0, 3))!,
          productId: products.get(r.product)!,
          openingDate: r.openingDate,
          maturityDate: r.maturityDate,
        };
        if (existing) {
          await tx.loanAccount.update({ where: { id: existing.id }, data });
          await tx.borrower.update({
            where: { id: existing.borrowerId },
            data: { name: r.borrower, phone: r.phone, address: r.address, ...(r.memberId ? { memberId: r.memberId } : {}) },
          });
        } else {
          const borrower = r.memberId
            ? await tx.borrower.upsert({
                where: { memberId: r.memberId },
                update: { name: r.borrower, phone: r.phone, address: r.address },
                create: { name: r.borrower, phone: r.phone, address: r.address, memberId: r.memberId },
              })
            : await tx.borrower.create({ data: { name: r.borrower, phone: r.phone, address: r.address } });
          const a = await tx.loanAccount.create({ data: { ...data, accountNumber: r.accountNumber, borrowerId: borrower.id } });
          accounts.set(r.accountNumber, { id: a.id, accountNumber: a.accountNumber, borrowerId: borrower.id });
        }
      }

      const snapshot = await tx.snapshot.create({
        data: {
          asOf,
          sourceFile: input.sourceFile,
          checksum: input.checksum,
          rowCount: rows.length,
          uploadedById: input.userId,
        },
      });

      await tx.loanSnapshotRow.createMany({
        data: rows.map((r) => ({
          snapshotId: snapshot.id,
          accountId: accounts.get(r.accountNumber)!.id,
          interestRate: r.interestRate,
          penalRate: r.penalRate,
          granted: r.granted,
          principal: r.principal,
          interestPaid: r.interestPaid,
          penalChargePaid: r.penalChargePaid,
          principalPaid: r.principalPaid,
          principalBalance: r.principalBalance,
          installmentAmount: r.installmentAmount,
          penalBalance: r.penalBalance,
          interestBalance: r.interestBalance,
          chargeBalance: r.chargeBalance,
          overduePrincipal: r.overduePrincipal,
          overdueInterest: r.overdueInterest,
          installmentsPaid: r.installmentsPaid,
          dpd: r.dpd,
          term: r.term,
          lastTransactionDate: r.lastTransactionDate,
          frequency: r.frequency,
          accruedInterest: r.accruedInterest,
          accruedPenalty: r.accruedPenalty,
        })),
      });
      return snapshot;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
