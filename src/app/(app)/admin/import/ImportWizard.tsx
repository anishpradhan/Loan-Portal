"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload } from "lucide-react";
import { buttonClass } from "@/components/ui/form";
import { Notice } from "@/components/ui/primitives";
import { formatCompactNPR } from "@/domain/money";
import type { CommitResult, ImportAnalysis } from "@/server/import/importService";

type Step = "pick" | "analysing" | "review" | "committing" | "done";

export function ImportWizard({ defaultFiscalYear }: { defaultFiscalYear: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pick");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [withDirectory, setWithDirectory] = useState(true);
  const [withBudget, setWithBudget] = useState(true);
  const [fy, setFy] = useState(defaultFiscalYear);
  const [result, setResult] = useState<CommitResult | null>(null);

  async function analyse(file: File) {
    setError(null);
    setStep("analysing");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/import/analyse", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Upload failed");
      setStep("pick");
      return;
    }
    const a = json as ImportAnalysis;
    setAnalysis(a);
    // pre-select dated sheets not yet imported (MID export without a date is opt-in)
    setSelected(Object.fromEntries(a.sheets.map((s) => [s.sheetName, !s.alreadyImported && !!s.reportDate])));
    setWithDirectory(!!a.branchDirectory);
    setWithBudget(!!a.budget);
    setStep("review");
  }

  async function commit() {
    if (!analysis) return;
    setError(null);
    setStep("committing");
    const res = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: analysis.token,
        sheets: analysis.sheets.filter((s) => selected[s.sheetName]).map((s) => ({ sheetName: s.sheetName, reportDate: s.reportDate ?? dates[s.sheetName] ?? null })),
        importBranchDirectory: withDirectory && !!analysis.branchDirectory,
        budgetFiscalYear: withBudget && analysis.budget ? fy : null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Import failed");
      setStep("review");
      return;
    }
    setResult(json);
    setStep("done");
    router.refresh();
  }

  if (step === "done" && result) {
    return (
      <div className="space-y-4">
        <Notice tone="success">
          Imported {result.snapshots.length} snapshot{result.snapshots.length === 1 ? "" : "s"} ({result.snapshots.reduce((s, x) => s + x.rows, 0).toLocaleString("en-IN")} loan rows)
          {result.branchesUpdated > 0 && `, updated ${result.branchesUpdated} branches`}
          {result.budgetRows > 0 && `, ${result.budgetRows} budget targets`}.
        </Notice>
        <div className="flex gap-2">
          <Link href="/" className={buttonClass()}>Open dashboard</Link>
          <button className={buttonClass("secondary")} onClick={() => { setStep("pick"); setAnalysis(null); setResult(null); }}>Import another file</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}

      {(step === "pick" || step === "analysing") && (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-surface px-6 py-12 text-center hover:border-accent/60">
          <Upload className="h-8 w-8 text-muted" aria-hidden />
          <div className="text-sm">
            <span className="font-medium text-accent">{step === "analysing" ? "Reading workbook…" : "Choose an Excel file"}</span>
            <div className="mt-1 text-muted">Loan Master List export (.xlsx) or the consolidated workbook (.xlsm). Nothing is saved until you confirm.</div>
          </div>
          <input
            type="file"
            accept=".xlsx,.xlsm"
            className="sr-only"
            disabled={step === "analysing"}
            onChange={(e) => e.target.files?.[0] && analyse(e.target.files[0])}
          />
        </label>
      )}

      {analysis && (step === "review" || step === "committing") && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-muted" aria-hidden />
            <span className="font-medium">{analysis.fileName}</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-2">
                <tr>
                  <th className="px-3 py-2">Import</th>
                  <th className="px-3 py-2">Sheet</th>
                  <th className="px-3 py-2">Report date</th>
                  <th className="px-3 py-2 text-right">Loans</th>
                  <th className="px-3 py-2 text-right">Branches</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                  <th className="px-3 py-2">Validation</th>
                </tr>
              </thead>
              <tbody>
                {analysis.sheets.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">No Loan Master List sheet found in this file.</td></tr>
                )}
                {analysis.sheets.map((s) => (
                  <tr key={s.sheetName} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Import ${s.sheetName}`}
                        checked={!!selected[s.sheetName]}
                        disabled={s.alreadyImported}
                        onChange={(e) => setSelected({ ...selected, [s.sheetName]: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium">{s.sheetName}<div className="text-xs font-normal text-muted">{s.format === "MID" ? "MID export" : "Loan Master List"}</div></td>
                    <td className="px-3 py-2">
                      {s.reportDate ? (
                        s.reportDate.slice(0, 16).replace("T", " ")
                      ) : (
                        <input
                          type="datetime-local"
                          aria-label={`Report date for ${s.sheetName}`}
                          value={dates[s.sheetName] ?? ""}
                          onChange={(e) => setDates({ ...dates, [s.sheetName]: e.target.value ? `${e.target.value}:00.000Z` : "" })}
                          className="rounded border border-border bg-surface px-2 py-1"
                        />
                      )}
                      {s.alreadyImported && <div className="text-xs text-muted">Already imported</div>}
                    </td>
                    <td className="px-3 py-2 num">{s.rowCount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 num">{s.branches}</td>
                    <td className="px-3 py-2 num">{formatCompactNPR(Math.round(s.outstanding * 100))}</td>
                    <td className="px-3 py-2">
                      {s.issues.length === 0 ? (
                        <span className="text-good-text">✓ All rows valid</span>
                      ) : (
                        <details>
                          <summary className="cursor-pointer text-critical-text">{s.issues.length} row{s.issues.length > 1 ? "s" : ""} skipped</summary>
                          <ul className="mt-1 max-h-40 overflow-auto text-xs text-ink-2">
                            {s.issues.map((i, k) => <li key={k}>Row {i.row}: {i.message}</li>)}
                          </ul>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`flex items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm ${!analysis.branchDirectory ? "opacity-50" : ""}`}>
              <input type="checkbox" checked={withDirectory && !!analysis.branchDirectory} disabled={!analysis.branchDirectory} onChange={(e) => setWithDirectory(e.target.checked)} />
              <span>
                <span className="font-medium">Branch directory</span>
                <span className="block text-muted">{analysis.branchDirectory ? `${analysis.branchDirectory.count} branches with province and emails (from ${analysis.branchDirectory.source})` : "Not found in this file"}</span>
              </span>
            </label>
            <label className={`flex items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm ${!analysis.budget ? "opacity-50" : ""}`}>
              <input type="checkbox" checked={withBudget && !!analysis.budget} disabled={!analysis.budget} onChange={(e) => setWithBudget(e.target.checked)} />
              <span className="flex-1">
                <span className="font-medium">Budget targets</span>
                <span className="block text-muted">{analysis.budget ? `${analysis.budget.branches} branches × 12 months (sheet “${analysis.budget.sheetName}”)` : "Not found in this file"}</span>
                {analysis.budget && (
                  <span className="mt-2 flex items-center gap-2">
                    Fiscal year
                    <input value={fy} onChange={(e) => setFy(e.target.value)} pattern="\d{4}/\d{2}" className="w-24 rounded border border-border bg-surface px-2 py-1" aria-label="Fiscal year" />
                  </span>
                )}
              </span>
            </label>
          </div>

          <div className="flex gap-2">
            <button className={buttonClass()} disabled={step === "committing"} onClick={commit}>
              {step === "committing" ? "Importing… (this can take a minute)" : "Confirm import"}
            </button>
            <button className={buttonClass("secondary")} disabled={step === "committing"} onClick={() => { setAnalysis(null); setStep("pick"); }}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
