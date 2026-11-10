import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import type { PortfolioSummary } from "@/domain/aggregate";
import { interestDue, outstanding, provisionFor, requiredToClose } from "@/domain/loan";
import { fromPaisa } from "@/domain/money";
import { bucketLabel, PROVISION_BUCKETS } from "@/domain/provisioning";
import { fmtDateTime } from "@/lib/dates";
import { audit } from "@/server/audit";
import { loadContext } from "@/server/pageContext";
import { applyStaffFilter } from "@/server/views/common";
import { buildReport } from "@/server/views/report";

export const runtime = "nodejs";

// Lakh/crore digit grouping in Excel
const NPR = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';
const PCT = "0.00%";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C3A63" } };

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width?: number; fmt?: string }[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 2), style: c.fmt ? { numFmt: c.fmt } : {} }));
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle" };
  });
  ws.addRows(rows);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

function summarySheet(wb: ExcelJS.Workbook, name: string, label: string, rows: PortfolioSummary[]) {
  sheet(
    wb,
    name,
    [
      { header: label, key: "key", width: 36 },
      { header: "Loans", key: "accounts" },
      { header: "Borrowers", key: "borrowers" },
      { header: "Outstanding", key: "outstanding", width: 20, fmt: NPR },
      { header: "Share", key: "weight", fmt: PCT },
      { header: "Principal overdue", key: "principalOverdue", width: 20, fmt: NPR },
      { header: "Interest due", key: "interestDue", width: 18, fmt: NPR },
      { header: "Penalty due", key: "penaltyDue", width: 16, fmt: NPR },
      { header: "NPL ratio", key: "nplRatio", fmt: PCT },
      { header: "Provision", key: "provision", width: 18, fmt: NPR },
      { header: "Yield %", key: "yieldRate", fmt: "0.00" },
    ],
    rows.map((r) => ({
      ...r,
      outstanding: fromPaisa(r.outstanding),
      principalOverdue: fromPaisa(r.principalOverdue),
      interestDue: fromPaisa(r.interestDue),
      penaltyDue: fromPaisa(r.penaltyDue),
      provision: fromPaisa(r.provision),
    })),
  );
}

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const ctx = await loadContext(Promise.resolve(params), { withPrevious: true });
  const r = await buildReport(ctx);
  if (!r) return NextResponse.json({ error: "No data" }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Loan Portfolio Monitor";
  wb.created = new Date();

  const s = wb.addWorksheet("Summary");
  s.columns = [{ width: 34 }, { width: 24 }, { width: 24 }];
  s.addRow([r.title]).font = { bold: true, size: 14 };
  s.addRow(["As of", fmtDateTime(r.asOf)]);
  s.addRow(["Compared with", r.previousAsOf ? fmtDateTime(r.previousAsOf) : "—"]);
  s.addRow(["Coverage", `${r.scopeLabel}${r.includeStaff ? " (incl. staff loans)" : " (excl. staff loans)"}`]);
  s.addRow(["Prepared by", r.preparedBy]);
  s.addRow([]);
  s.addRow(["Measure", "Current", "Previous"]).font = { bold: true };
  const kpi = (label: string, cur: number, prev: number | undefined, fmt: string) => {
    const row = s.addRow([label, cur, prev ?? null]);
    row.getCell(2).numFmt = fmt;
    row.getCell(3).numFmt = fmt;
  };
  const t = r.totals;
  const p = r.previousTotals ?? undefined;
  kpi("Loans", t.accounts, p?.accounts, "#,##0");
  kpi("Outstanding", fromPaisa(t.outstanding), p && fromPaisa(p.outstanding), NPR);
  kpi("Principal overdue", fromPaisa(t.principalOverdue), p && fromPaisa(p.principalOverdue), NPR);
  kpi("Interest due", fromPaisa(t.interestDue), p && fromPaisa(p.interestDue), NPR);
  kpi("NPL ratio", t.nplRatio, p?.nplRatio, PCT);
  kpi("Provision required", fromPaisa(t.provision), p && fromPaisa(p.provision), NPR);
  kpi("Yield %", t.yieldRate, p?.yieldRate, "0.00");
  s.addRow([]);
  s.addRow(["Highlights"]).font = { bold: true };
  for (const h of r.highlights) s.addRow([h]);

  sheet(
    wb,
    "Classification",
    [
      { header: "Class", key: "label" },
      { header: "Max DPD", key: "maxDpd" },
      { header: "Rate", key: "rate", fmt: PCT },
      { header: "Loans", key: "count" },
      { header: "Outstanding", key: "outstanding", width: 20, fmt: NPR },
      { header: "Provision", key: "provision", width: 20, fmt: NPR },
    ],
    PROVISION_BUCKETS.map((b) => ({
      label: bucketLabel(b.cls),
      maxDpd: Number.isFinite(b.maxDpd) ? b.maxDpd : "over 365",
      rate: b.rate,
      count: t.countByClass[b.cls],
      outstanding: fromPaisa(t.outstandingByClass[b.cls]),
      provision: fromPaisa(t.provisionByClass[b.cls]),
    })),
  );
  summarySheet(wb, "Provinces", "Province", r.byProvince);
  summarySheet(wb, "Branches", "Branch", r.byBranch);
  summarySheet(wb, "Products", "Product", r.byProduct);
  sheet(
    wb,
    "Top borrowers",
    [
      { header: "Borrower", key: "borrower", width: 50 },
      { header: "Branches", key: "branches", width: 30 },
      { header: "Loans", key: "accounts" },
      { header: "Outstanding", key: "outstanding", width: 20, fmt: NPR },
      { header: "Share", key: "share", fmt: PCT },
      { header: "Worst DPD", key: "worstDpd" },
    ],
    r.topBorrowers.map((b) => ({ ...b, outstanding: fromPaisa(b.outstanding) })),
  );

  const loans = applyStaffFilter(ctx.positions, params).filter(
    (l) => (!params.province || l.province === params.province) && (!params.branch || l.branch === params.branch),
  );
  sheet(
    wb,
    "Loans",
    [
      { header: "Account", key: "accountNumber", width: 18 },
      { header: "Borrower", key: "borrower", width: 44 },
      { header: "Branch", key: "branch", width: 24 },
      { header: "Province", key: "province", width: 20 },
      { header: "Product", key: "product", width: 30 },
      { header: "Opened", key: "openingDate", fmt: "yyyy-mm-dd" },
      { header: "Maturity", key: "maturityDate", fmt: "yyyy-mm-dd" },
      { header: "Rate %", key: "interestRate", fmt: "0.00" },
      { header: "Disbursed", key: "principal", width: 18, fmt: NPR },
      { header: "Outstanding", key: "outstanding", width: 18, fmt: NPR },
      { header: "Principal OD", key: "overduePrincipal", width: 18, fmt: NPR },
      { header: "Interest due", key: "interestDue", width: 16, fmt: NPR },
      { header: "DPD", key: "dpd" },
      { header: "Class", key: "cls" },
      { header: "Provision", key: "provision", width: 16, fmt: NPR },
      { header: "Required to close", key: "requiredToClose", width: 18, fmt: NPR },
    ],
    loans.map((l) => {
      const pr = provisionFor(l);
      return {
        accountNumber: l.accountNumber,
        borrower: l.borrower,
        branch: l.branch,
        province: l.province,
        product: l.product,
        openingDate: l.openingDate,
        maturityDate: l.maturityDate,
        interestRate: l.interestRate,
        principal: fromPaisa(l.principal),
        outstanding: fromPaisa(outstanding(l)),
        overduePrincipal: fromPaisa(l.overduePrincipal),
        interestDue: fromPaisa(interestDue(l)),
        dpd: l.dpd,
        cls: bucketLabel(pr.cls),
        provision: l.excludeFromProvisioning ? 0 : fromPaisa(pr.amount),
        requiredToClose: fromPaisa(requiredToClose(l)),
      };
    }),
  );

  const buf = await wb.xlsx.writeBuffer();
  await audit(ctx.user.id, "report.export_xlsx", "report", undefined, { params, loans: loans.length });
  const fname = `${r.title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
