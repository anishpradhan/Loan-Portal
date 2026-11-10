"use client";

import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/form";

export function ReportActions({ query }: { query: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <button className={buttonClass("secondary")} onClick={() => window.print()}>
        <Printer className="h-4 w-4" aria-hidden /> Print
      </button>
      <a className={buttonClass("secondary")} href={`/api/reports/xlsx?${query}`}>
        <FileSpreadsheet className="h-4 w-4" aria-hidden /> Excel
      </a>
      <a
        className={buttonClass()}
        href={`/api/reports/pdf?${query}`}
        onClick={() => {
          setBusy(true);
          setTimeout(() => setBusy(false), 8000);
        }}
      >
        <Download className="h-4 w-4" aria-hidden /> {busy ? "Preparing PDF…" : "Download PDF"}
      </a>
    </div>
  );
}
