import ExcelJS from "exceljs";
import { z } from "zod";

/**
 * Parser for the core-banking "Loan Master List" export (and the MID export,
 * which has the same data under different headers). Columns are located by
 * header text, so column order in the export does not matter.
 */

export type FieldKey =
  | "branch" | "product" | "accountNumber" | "phone" | "borrower" | "address"
  | "openingDate" | "maturityDate" | "interestRate" | "penalRate" | "granted"
  | "principal" | "interestPaid" | "penalChargePaid" | "principalPaid"
  | "principalBalance" | "installmentAmount" | "penalBalance" | "interestBalance"
  | "chargeBalance" | "overduePrincipal" | "overdueInterest" | "installmentsPaid"
  | "dpd" | "term" | "lastTransactionDate" | "frequency" | "accruedInterest"
  | "accruedPenalty" | "memberId";

const HEADER_ALIASES: Record<FieldKey, string[]> = {
  branch: ["branch name", "branchname"],
  product: ["chart of account", "headname"],
  accountNumber: ["account number", "accountnumberfordisplay"],
  phone: ["phone"],
  borrower: ["member name", "fullname"],
  address: ["address", "customeraddress"],
  openingDate: ["opening date", "openingdate"],
  maturityDate: ["maturity date", "maturitydate"],
  interestRate: ["interest rate", "intrate"],
  penalRate: ["penal rate", "penrate"],
  granted: ["granted"],
  principal: ["principal"],
  interestPaid: ["interest paid", "interestpaid"],
  penalChargePaid: ["penal & charge paid", "penchgpd"],
  principalPaid: ["principal paid", "principalpd"],
  principalBalance: ["principal balance", "principalbal"],
  installmentAmount: ["installment amount", "installmentamt"],
  penalBalance: ["penal balance", "penbal"],
  interestBalance: ["interest balance", "interestbal"],
  chargeBalance: ["charge balance", "chargebal"],
  overduePrincipal: ["overdue pri", "overduepri"],
  overdueInterest: ["overdue interest", "overdueint"],
  installmentsPaid: ["inst"],
  dpd: ["overdue"],
  term: ["term"],
  lastTransactionDate: ["last transaction date", "lasttrndt"],
  frequency: ["frequency", "freq"],
  accruedInterest: ["accrued interest", "accruedinterest"],
  accruedPenalty: ["accrued penalty", "accruedpenalty"],
  memberId: ["membernumber"],
};

const REQUIRED: FieldKey[] = [
  "branch", "product", "accountNumber", "borrower", "principalBalance", "dpd", "interestRate",
];

export const rawLoanRowSchema = z.object({
  rowNumber: z.number(),
  branch: z.string().min(1, "Branch is empty"),
  product: z.string().min(1, "Chart of Account is empty"),
  accountNumber: z.string().regex(/^\d{15}$/, "Account number must be 15 digits"),
  phone: z.string().nullable(),
  borrower: z.string().min(1, "Member name is empty"),
  address: z.string().nullable(),
  memberId: z.string().nullable(),
  openingDate: z.date().nullable(),
  maturityDate: z.date().nullable(),
  interestRate: z.number(),
  penalRate: z.number(),
  granted: z.number(),
  principal: z.number(),
  interestPaid: z.number(),
  penalChargePaid: z.number(),
  principalPaid: z.number(),
  principalBalance: z.number(),
  installmentAmount: z.number(),
  penalBalance: z.number(),
  interestBalance: z.number(),
  chargeBalance: z.number(),
  overduePrincipal: z.number(),
  overdueInterest: z.number(),
  installmentsPaid: z.number().int(),
  dpd: z.number().int().min(0, "DPD cannot be negative"),
  term: z.number().int(),
  lastTransactionDate: z.date().nullable(),
  frequency: z.string().nullable(),
  accruedInterest: z.number(),
  accruedPenalty: z.number(),
});
export type RawLoanRow = z.infer<typeof rawLoanRowSchema>;

export interface ParseIssue {
  row: number;
  message: string;
}

export interface ParsedMasterList {
  sheetName: string;
  format: "MASTER_LIST" | "MID";
  reportDate: Date | null;
  rows: RawLoanRow[];
  issues: ParseIssue[];
  totalRows: number;
}

// ---------- cell helpers ----------

export function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return (v as { text: string }).text;
    if ("error" in v) return null;
    return null;
  }
  return v;
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

function asNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

/** Excel dates are often exported as UTC midnight; keep the calendar date. */
function asDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
  const s = String(v).trim();
  // "1/24/2019 12:00:00 AM" (US) or "2019-01-24"
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return new Date(Date.UTC(+us[3], +us[1] - 1, +us[2]));
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  return null;
}

function asDateTime(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return asDate(v);
}

function norm(h: unknown): string {
  return String(h ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------- sheet detection ----------

function findHeaderRow(ws: ExcelJS.Worksheet): { row: number; map: Map<FieldKey, number> } | null {
  const maxScan = Math.min(ws.rowCount, 15);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const map = new Map<FieldKey, number>();
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = norm(cellValue(cell.value));
      for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [FieldKey, string[]][]) {
        if (!map.has(key) && aliases.includes(h)) map.set(key, col);
      }
    });
    if (REQUIRED.every((k) => map.has(k))) return { row: r, map };
  }
  return null;
}

function findReportDate(ws: ExcelJS.Worksheet, headerRow: number): Date | null {
  for (let r = 1; r < headerRow; r++) {
    const row = ws.getRow(r);
    let found: Date | null = null;
    row.eachCell((cell, col) => {
      const label = norm(cellValue(cell.value));
      if (!found && label.startsWith("report date")) {
        found = asDateTime(cellValue(row.getCell(col + 1).value));
      }
    });
    if (found) return found;
  }
  return null;
}

export function isMasterListSheet(ws: ExcelJS.Worksheet): boolean {
  return findHeaderRow(ws) !== null;
}

export function parseMasterListSheet(ws: ExcelJS.Worksheet): ParsedMasterList {
  const header = findHeaderRow(ws);
  if (!header) {
    throw new Error(
      `Sheet "${ws.name}" is not a Loan Master List: missing columns ` +
        REQUIRED.map((k) => `"${HEADER_ALIASES[k][0]}"`).join(", "),
    );
  }
  const { row: headerRow, map } = header;
  const format = map.has("memberId") ? "MID" : "MASTER_LIST";
  const rows: RawLoanRow[] = [];
  const issues: ParseIssue[] = [];
  const seen = new Set<string>();
  let totalRows = 0;

  const get = (row: ExcelJS.Row, key: FieldKey) => {
    const col = map.get(key);
    return col ? cellValue(row.getCell(col).value) : null;
  };

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const acc = asString(get(row, "accountNumber"));
    const branch = asString(get(row, "branch"));
    if (!acc && !branch) continue; // blank line
    if (branch && /^total/i.test(branch)) continue; // footer
    totalRows++;

    const candidate = {
      rowNumber: r,
      branch: branch ?? "",
      product: asString(get(row, "product")) ?? "",
      accountNumber: (acc ?? "").replace(/\D/g, "").padStart(15, "0"),
      phone: asString(get(row, "phone")),
      borrower: asString(get(row, "borrower")) ?? "",
      address: asString(get(row, "address")),
      memberId: asString(get(row, "memberId")),
      openingDate: asDate(get(row, "openingDate")),
      maturityDate: asDate(get(row, "maturityDate")),
      interestRate: asNumber(get(row, "interestRate")),
      penalRate: asNumber(get(row, "penalRate")),
      granted: asNumber(get(row, "granted")),
      principal: asNumber(get(row, "principal")),
      interestPaid: asNumber(get(row, "interestPaid")),
      penalChargePaid: asNumber(get(row, "penalChargePaid")),
      principalPaid: asNumber(get(row, "principalPaid")),
      principalBalance: asNumber(get(row, "principalBalance")),
      installmentAmount: asNumber(get(row, "installmentAmount")),
      penalBalance: asNumber(get(row, "penalBalance")),
      interestBalance: asNumber(get(row, "interestBalance")),
      chargeBalance: asNumber(get(row, "chargeBalance")),
      overduePrincipal: asNumber(get(row, "overduePrincipal")),
      overdueInterest: asNumber(get(row, "overdueInterest")),
      installmentsPaid: Math.round(asNumber(get(row, "installmentsPaid"))),
      dpd: Math.round(asNumber(get(row, "dpd"))),
      term: Math.round(asNumber(get(row, "term"))),
      lastTransactionDate: asDate(get(row, "lastTransactionDate")),
      frequency: asString(get(row, "frequency")),
      accruedInterest: asNumber(get(row, "accruedInterest")),
      accruedPenalty: asNumber(get(row, "accruedPenalty")),
    };

    const parsed = rawLoanRowSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const iss of parsed.error.issues) {
        const field = iss.path.join(".");
        issues.push({ row: r, message: `${field}: ${iss.message === "Invalid input: expected number, received NaN" ? "not a number" : iss.message}` });
      }
      continue;
    }
    if (seen.has(parsed.data.accountNumber)) {
      issues.push({ row: r, message: `Duplicate account number ${parsed.data.accountNumber}` });
      continue;
    }
    seen.add(parsed.data.accountNumber);
    rows.push(parsed.data);
  }

  return { sheetName: ws.name, format, reportDate: findReportDate(ws, headerRow), rows, issues, totalRows };
}

export async function loadWorkbook(buffer: ArrayBuffer | Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any, { ignoreNodes: ["dataValidations", "conditionalFormatting", "drawing", "legacyDrawing", "picture", "hyperlinks"] } as any);
  return wb;
}
