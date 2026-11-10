"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Search } from "lucide-react";
import { formatNPR } from "@/domain/money";
import { ClassBadge } from "./ClassBadge";
import type { LoanClass } from "@/domain/provisioning";

export type ColKind = "text" | "money" | "int" | "pct" | "rate" | "date" | "class" | "dpd" | "delta";

export interface Col {
  key: string;
  label: string;
  kind?: ColKind;
  /** link template, e.g. "/accounts/{accountNumber}" */
  href?: string;
  total?: boolean;
  width?: string;
}

export type Row = Record<string, string | number | boolean | null | undefined>;

function fmt(v: Row[string], kind: ColKind = "text"): React.ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-muted">—</span>;
  switch (kind) {
    case "money":
      return formatNPR(Number(v));
    case "delta": {
      const n = Number(v);
      return <span className={n > 0 ? "text-critical-text" : n < 0 ? "text-good-text" : ""}>{n > 0 ? "+" : ""}{formatNPR(n)}</span>;
    }
    case "int":
    case "dpd":
      return Number(v).toLocaleString("en-IN");
    case "pct":
      return `${(Number(v) * 100).toFixed(2)}%`;
    case "rate":
      return `${Number(v).toFixed(2)}%`;
    case "date":
      return String(v).slice(0, 10);
    case "class":
      return <ClassBadge cls={v as LoanClass} />;
    default:
      return String(v);
  }
}

function plain(v: Row[string], kind: ColKind = "text"): string {
  if (v === null || v === undefined) return "";
  if (kind === "money" || kind === "delta") return (Number(v) / 100).toFixed(2);
  if (kind === "pct") return (Number(v) * 100).toFixed(4);
  return String(v);
}

const isNumeric = (k?: ColKind) => k === "money" || k === "int" || k === "pct" || k === "rate" || k === "dpd" || k === "delta";

export function DataTable({
  columns,
  rows,
  pageSize = 50,
  searchable = true,
  exportName,
  initialSort,
  empty = "No records.",
  dense,
}: {
  columns: Col[];
  rows: Row[];
  pageSize?: number;
  searchable?: boolean;
  exportName?: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  empty?: string;
  dense?: boolean;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [limit, setLimit] = useState(pageSize);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = needle
      ? rows.filter((row) => columns.some((c) => String(row[c.key] ?? "").toLowerCase().includes(needle)))
      : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const num = isNumeric(col?.kind);
      r = [...r].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        const cmp = num ? Number(x ?? -Infinity) - Number(y ?? -Infinity) : String(x ?? "").localeCompare(String(y ?? ""));
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, q, sort, columns]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of columns) if (c.total) t[c.key] = filtered.reduce((s, r) => s + Number(r[c.key] ?? 0), 0);
    return t;
  }, [filtered, columns]);
  const hasTotals = columns.some((c) => c.total);

  function toggleSort(key: string) {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  function exportCsv() {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [columns.map((c) => esc(c.label)).join(",")];
    for (const r of filtered) lines.push(columns.map((c) => esc(plain(r[c.key], c.kind))).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const cell = dense ? "px-3 py-1.5" : "px-3 py-2";

  return (
    <div>
      {(searchable || exportName) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 no-print">
          {searchable && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setLimit(pageSize);
                }}
                placeholder="Search…"
                aria-label="Search table"
                className="w-64 max-w-full rounded-md border border-border bg-surface py-2 pl-8 pr-3 text-sm outline-none focus:border-accent"
              />
            </div>
          )}
          <span className="text-sm text-muted">
            {filtered.length.toLocaleString("en-IN")} {filtered.length === 1 ? "record" : "records"}
          </span>
          {exportName && (
            <button onClick={exportCsv} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2">
              <Download className="h-4 w-4" aria-hidden /> CSV
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-2">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  className={clsx(cell, "font-semibold whitespace-nowrap select-none", isNumeric(c.kind) && "text-right")}
                >
                  <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                    {c.label}
                    {sort?.key === c.key && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-muted">
                  {empty}
                </td>
              </tr>
            )}
            {filtered.slice(0, limit).map((r, i) => (
              <tr key={i} className="border-t border-border hover:bg-surface-2/60">
                {columns.map((c) => {
                  const content = fmt(r[c.key], c.kind);
                  const href = c.href?.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(r[k] ?? "")));
                  return (
                    <td
                      key={c.key}
                      className={clsx(cell, isNumeric(c.kind) ? "num" : c.kind === "text" || !c.kind ? "max-w-[18rem] truncate" : "whitespace-nowrap")}
                      title={!isNumeric(c.kind) && typeof r[c.key] === "string" ? String(r[c.key]) : undefined}
                    >
                      {href ? (
                        <Link href={href} className="text-accent hover:underline">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {hasTotals && filtered.length > 0 && (
            <tfoot className="border-t-2 border-border bg-surface-2 font-semibold">
              <tr>
                {columns.map((c, i) => (
                  <td key={c.key} className={clsx(cell, isNumeric(c.kind) && "num")}>
                    {c.total ? fmt(totals[c.key], c.kind) : i === 0 ? "Total" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {filtered.length > limit && (
        <div className="mt-3 text-center no-print">
          <button onClick={() => setLimit((l) => l + pageSize * 4)} className="text-sm text-accent hover:underline">
            Show more ({(filtered.length - limit).toLocaleString("en-IN")} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
