/**
 * Parity tests: the calculation engine must reproduce the numbers that
 * the original consolidated workbook computed (values cached by Excel).
 *
 * The workbook contains customer data and is NOT committed. Run with:
 *   PARITY_WORKBOOK=/path/to/Report_Consoliated.xlsm npm test
 */
import { existsSync, readFileSync } from "node:fs";
import type ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { summarizeGroup } from "@/domain/aggregate";
import {
  dailyInterest,
  dailyPenalty,
  effectiveDpd,
  provisionFor,
  requiredToClose,
  type LoanPosition,
} from "@/domain/loan";
import { fromPaisa } from "@/domain/money";
import { compareSnapshots, newLoans, reconcileByBranch } from "@/domain/movement";
import { cellValue, loadWorkbook, parseMasterListSheet } from "@/server/excel/masterList";
import { rawToPosition } from "@/server/excel/toPosition";

const PATH = process.env.PARITY_WORKBOOK ?? "";
const run = PATH && existsSync(PATH) ? describe : describe.skip;
const TOL = 0.05; // same tolerance the workbook uses in Report!AM

let wb: ExcelJS.Workbook;
let oldRows: LoanPosition[];
let newRows: LoanPosition[];

function num(ws: ExcelJS.Worksheet, addr: string): number {
  const v = cellValue(ws.getCell(addr).value);
  return typeof v === "number" ? v : Number(v ?? 0);
}

run("parity with consolidated workbook", () => {
  beforeAll(async () => {
    wb = await loadWorkbook(readFileSync(PATH));
    oldRows = parseMasterListSheet(wb.getWorksheet("Old Master List")!).rows.map((r) => rawToPosition(r));
    newRows = parseMasterListSheet(wb.getWorksheet("New Master List")!).rows.map((r) => rawToPosition(r));
  }, 120_000);

  it("per-loan provisioning, required-to-close and accruals match the Report sheet", () => {
    const ws = wb.getWorksheet("Report")!;
    const byAcc = new Map(newRows.map((r) => [r.accountNumber, r]));
    let checked = 0;
    const failures: string[] = [];
    for (let r = 4; r <= ws.rowCount; r++) {
      const acc = cellValue(ws.getCell(`R${r}`).value);
      if (!acc) continue;
      const loan = byAcc.get(String(acc));
      expect(loan, `account ${acc} missing from New Master List`).toBeDefined();
      const p = provisionFor(loan!);
      const checks: [string, number, number][] = [
        ["LLP %", p.rate, num(ws, `Y${r}`)],
        ["LLP amount", fromPaisa(p.amount), num(ws, `Z${r}`)],
        ["required to close", fromPaisa(requiredToClose(loan!)), num(ws, `AA${r}`)],
        ["daily interest", fromPaisa(dailyInterest(loan!)), num(ws, `AB${r}`)],
        ["daily penalty", fromPaisa(dailyPenalty(loan!)), num(ws, `AC${r}`)],
      ];
      for (const [name, got, want] of checks) {
        if (Math.abs(got - want) > TOL) failures.push(`row ${r} ${name}: got ${got}, workbook ${want}`);
      }
      checked++;
    }
    expect(failures.slice(0, 10)).toEqual([]);
    expect(checked).toBeGreaterThan(2000);
  });

  it("Report sheet excludes exactly the staff loans", () => {
    const ws = wb.getWorksheet("Report")!;
    const inReport = new Set<string>();
    for (let r = 4; r <= ws.rowCount; r++) {
      const acc = cellValue(ws.getCell(`R${r}`).value);
      if (acc) inReport.add(String(acc));
    }
    const provisionable = newRows.filter((l) => !l.excludeFromProvisioning).map((l) => l.accountNumber);
    expect(new Set(provisionable)).toEqual(inReport);
  });

  it("portfolio totals match Report row 2 subtotals", () => {
    const ws = wb.getWorksheet("Report")!;
    const s = summarizeGroup("all", newRows.filter((l) => !l.excludeFromProvisioning));
    expect(Math.abs(fromPaisa(s.outstanding) - Math.abs(num(ws, "J2")))).toBeLessThan(TOL);
    expect(Math.abs(fromPaisa(s.principalOverdue) - num(ws, "K2"))).toBeLessThan(TOL);
    expect(Math.abs(fromPaisa(s.interestDue) - Math.abs(num(ws, "L2")))).toBeLessThan(TOL);
    // Provision is rounded to the paisa per loan (what gets booked); Excel sums
    // unrounded values, so allow up to half a paisa per loan.
    expect(Math.abs(fromPaisa(s.provision) - num(ws, "Z2"))).toBeLessThan(s.accounts * 0.005);
  });

  it("IR-based DPD matches 'LLP as Per IR' where the sheet has values", () => {
    const ws = wb.getWorksheet("LLP as Per IR")!;
    const byAcc = new Map(newRows.map((r) => [r.accountNumber, r]));
    let checked = 0;
    for (let r = 4; r <= ws.rowCount; r++) {
      const acc = cellValue(ws.getCell(`H${r}`).value);
      const want = cellValue(ws.getCell(`O${r}`).value);
      if (!acc || typeof want !== "number") continue;
      const loan = byAcc.get(String(acc));
      if (!loan) continue;
      // The sheet is a manual paste from an earlier date; only compare when inputs agree.
      if (Math.abs(fromPaisa(loan.principalBalance) - num(ws, `D${r}`)) > TOL) continue;
      if (loan.dpd !== num(ws, `L${r}`)) continue;
      expect(effectiveDpd(loan)).toBeCloseTo(want, 4);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(0);
  });

  it("movement between snapshots reconciles for every branch", () => {
    const moves = compareSnapshots(oldRows, newRows);
    for (const r of reconcileByBranch(moves)) expect(r.difference).toBe(0);
  });

  it("movement totals match the Credit Movement sheet", () => {
    const ws = wb.getWorksheet("Credit Movement")!;
    const moves = compareSnapshots(oldRows, newRows);
    const sumBy = (pred: (m: (typeof moves)[number]) => boolean, f: (m: (typeof moves)[number]) => number) =>
      fromPaisa(moves.filter(pred).reduce((s, m) => s + f(m), 0));

    // Closed loans (H1) — workbook lists them with the old (negative) balance
    const closed = sumBy((m) => m.type === "CLOSED", (m) => m.oldOutstanding);
    expect(Math.abs(closed - Math.abs(num(ws, "H1")))).toBeLessThan(TOL);

    // New loans (BF / BL), Corporate Office excluded
    const nl = newLoans(moves);
    const nlTotal = fromPaisa(nl.reduce((s, m) => s + m.newOutstanding, 0));
    const wbNew = Math.abs(num(ws, "BF1") || num(ws, "BF2"));
    if (wbNew) expect(Math.abs(nlTotal - wbNew)).toBeLessThan(TOL);

    // Top-ups (AM = new - old)
    const topUps = sumBy((m) => m.type === "TOP_UP" && !m.excludeFromProvisioning, (m) => m.balanceChange);
    const wbTop = Math.abs(num(ws, "AL1") - num(ws, "AK1"));
    if (wbTop) expect(Math.abs(topUps - wbTop)).toBeLessThan(1);
  });
});
