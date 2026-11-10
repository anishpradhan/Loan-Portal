/**
 * One-time bootstrap from the consolidated workbook:
 *   npm run import:workbook -- /path/to/Report_Consoliated.xlsm [fiscalYear]
 * Imports the branch directory, every Loan Master List sheet (as dated
 * snapshots, oldest first) and the budget sheet.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/server/db";
import { analyseUpload, commitUpload } from "@/server/import/importService";
import { toBs } from "@/domain/nepali";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run import:workbook -- <file.xlsm> [fiscalYear e.g. 2083/84]");
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { id: "asc" } });
  if (!admin) throw new Error("Create the admin user first (npm run seed)");
  const buf = readFileSync(file);
  const a = await analyseUpload(buf, path.basename(file));
  for (const s of a.sheets) {
    console.log(`• ${s.sheetName}: ${s.rowCount} loans as of ${s.reportDate}${s.alreadyImported ? " (already imported, skipping)" : ""}${s.issues.length ? `, ${s.issues.length} issues` : ""}`);
  }
  const sheets = a.sheets.filter((s) => !s.alreadyImported && s.reportDate).map((s) => ({ sheetName: s.sheetName }));
  const latest = a.sheets.filter((s) => s.reportDate).at(-1)?.reportDate;
  const fy = process.argv[3] ?? (latest ? toBs(new Date(latest)).fiscalYear : null);
  const res = await commitUpload({
    token: a.token,
    sheets,
    importBranchDirectory: !!a.branchDirectory,
    budgetFiscalYear: a.budget ? fy : null,
    userId: admin.id,
  });
  console.log(`Imported ${res.snapshots.length} snapshot(s), ${res.branchesUpdated} branches, ${res.budgetRows} budget rows (FY ${fy}).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
