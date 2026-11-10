import type ExcelJS from "exceljs";
import { cellValue } from "./masterList";

/**
 * Reference data sheets: branch directory and monthly budget targets.
 */

const MONTHS = ["shrawan", "bhadra", "ashoj", "kartik", "mangsir", "poush", "magh", "falgun", "chaitra", "baisakh", "jestha", "ashad"];
const MONTH_ALIASES: Record<string, number> = Object.fromEntries(MONTHS.map((m, i) => [m, i + 1]));
MONTH_ALIASES["mangisr"] = 5; // spelling used in the workbook
MONTH_ALIASES["asoj"] = 3;
MONTH_ALIASES["asar"] = 12;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());

export interface BranchInfo {
  code: string;
  name: string; // "001-Main Branch"
  displayName: string | null;
  province: string | null;
  email: string | null;
  provinceEmail: string | null;
  provinceManager: string | null;
}

export interface BudgetRow {
  branch: string;
  month: number; // fiscal month 1..12
  amount: number;
}

/** Template sheet: Code | Branch Name | Province | Branch Email | Province Email | Province Manager */
export function parseBranchDirectory(ws: ExcelJS.Worksheet): BranchInfo[] | null {
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    // First occurrence of a header wins (some sheets repeat "Province" further right)
    const cols = new Map<string, number>();
    ws.getRow(r).eachCell((c, i) => {
      const h = str(cellValue(c.value)).toLowerCase();
      if (h && !cols.has(h)) cols.set(h, i);
    });
    if (!cols.has("province manager") && cols.has("pm")) cols.set("province manager", cols.get("pm")!);
    if (!cols.has("branch name") || !cols.has("province") || !cols.has("code")) continue;
    const at = (row: ExcelJS.Row, key: string) => {
      const i = cols.get(key);
      return i ? str(cellValue(row.getCell(i).value)) || null : null;
    };
    const out: BranchInfo[] = [];
    for (let i = r + 1; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const code = at(row, "code");
      const name = at(row, "branch name");
      if (!code || !name) continue;
      const c = code.padStart(3, "0");
      out.push({
        code: c,
        name: name.startsWith(`${c}-`) ? name : `${c}-${name}`,
        displayName: name.replace(/^\d{3}-/, ""),
        province: at(row, "province"),
        email: at(row, "branch email"),
        provinceEmail: at(row, "province email"),
        provinceManager: at(row, "province manager"),
      });
    }
    return out;
  }
  return null;
}

/**
 * Reads branch → province from the workbook's hidden "Back End" sheet (col B/C)
 * and emails / province managers from "Recovery Analysis" columns AA:AH.
 */
export function parseConsolidatedBranchDirectory(wb: ExcelJS.Workbook): BranchInfo[] {
  const backEnd = wb.getWorksheet("Back End");
  const recovery = wb.getWorksheet("Recovery Analysis");
  const byCode = new Map<string, BranchInfo>();
  if (backEnd) {
    for (let r = 1; r <= backEnd.rowCount; r++) {
      const name = str(cellValue(backEnd.getCell(`B${r}`).value));
      const m = name.match(/^(\d{3})-(.+)$/);
      if (!m) continue;
      const prov = str(cellValue(backEnd.getCell(`C${r}`).value));
      byCode.set(m[1], {
        code: m[1], name, displayName: m[2].trim(),
        province: prov && prov !== "-" ? prov : null,
        email: null, provinceEmail: null, provinceManager: null,
      });
    }
  }
  if (recovery) {
    for (let r = 3; r <= Math.min(recovery.rowCount, 200); r++) {
      const code = str(cellValue(recovery.getCell(`AA${r}`).value));
      if (!/^\d{3}$/.test(code)) continue;
      const b = byCode.get(code);
      if (!b) continue;
      b.email = str(cellValue(recovery.getCell(`AE${r}`).value)) || null;
      b.provinceEmail = str(cellValue(recovery.getCell(`AF${r}`).value)) || null;
      b.provinceManager = str(cellValue(recovery.getCell(`AG${r}`).value)) || null;
    }
  }
  return [...byCode.values()];
}

/** Sheet with a "Branch" column followed by fiscal month columns (Shrawan … Ashad). */
export function parseBudget(ws: ExcelJS.Worksheet): BudgetRow[] | null {
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    let branchCol = 0;
    const monthCols = new Map<number, number>();
    row.eachCell((c, i) => {
      const h = str(cellValue(c.value)).toLowerCase();
      if (h === "branch" && !branchCol) branchCol = i;
      // first block of month headers only (the sheet repeats them per province)
      if (MONTH_ALIASES[h] && branchCol && !monthCols.has(MONTH_ALIASES[h])) monthCols.set(MONTH_ALIASES[h], i);
    });
    if (!branchCol || monthCols.size < 12) continue;
    const out: BudgetRow[] = [];
    for (let i = r + 1; i <= ws.rowCount; i++) {
      const br = ws.getRow(i);
      const branch = str(cellValue(br.getCell(branchCol).value));
      if (!/^\d{3}-/.test(branch)) continue;
      for (const [month, col] of monthCols) {
        const v = cellValue(br.getCell(col).value);
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(n)) out.push({ branch, month, amount: Math.round(n * 100) / 100 });
      }
    }
    return out;
  }
  return null;
}
