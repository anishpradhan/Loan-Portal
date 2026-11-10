"use client";

import { useMemo, useState } from "react";
import { Download, Eye, FileSpreadsheet } from "lucide-react";
import { buttonClass, Field, Select } from "@/components/ui/form";
import type { SnapshotOption } from "@/components/shell/SnapshotPicker";

export function ReportBuilder({
  snapshots,
  defaultCurrent,
  defaultPrevious,
  provinces,
  branches,
  sections,
  initial,
}: {
  snapshots: SnapshotOption[];
  defaultCurrent: number | null;
  defaultPrevious: number | null;
  provinces: string[];
  branches: string[];
  sections: { key: string; label: string }[];
  initial: Record<string, string>;
}) {
  const [s, setS] = useState(String(defaultCurrent ?? ""));
  const [vs, setVs] = useState(String(defaultPrevious ?? ""));
  const [province, setProvince] = useState(initial.province ?? "");
  const [branch, setBranch] = useState(initial.branch ?? "");
  const [staff, setStaff] = useState(initial.staff === "1");
  const [title, setTitle] = useState(initial.title ?? "Loan Portfolio Report");
  const initialSecs = initial.sections ? initial.sections.split(",") : sections.map((x) => x.key);
  const [secs, setSecs] = useState<Set<string>>(new Set(initialSecs));

  const idx = snapshots.findIndex((o) => String(o.id) === s);
  const older = idx >= 0 ? snapshots.slice(idx + 1) : [];

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (s) q.set("s", s);
    if (vs) q.set("vs", vs);
    if (province) q.set("province", province);
    if (branch) q.set("branch", branch);
    if (staff) q.set("staff", "1");
    if (title.trim()) q.set("title", title.trim());
    if (secs.size !== sections.length) q.set("sections", sections.filter((x) => secs.has(x.key)).map((x) => x.key).join(","));
    return q.toString();
  }, [s, vs, province, branch, staff, title, secs, sections]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Report title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Select label="As of" value={s} onChange={(e) => { setS(e.target.value); setVs(""); }}>
          {snapshots.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
        <Select label="Compare with" value={vs} onChange={(e) => setVs(e.target.value)}>
          <option value="">{older.length ? "Previous snapshot (default)" : "No earlier snapshot"}</option>
          {older.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
        {provinces.length > 0 && (
          <Select label="Province" value={province} onChange={(e) => { setProvince(e.target.value); setBranch(""); }}>
            <option value="">All provinces</option>
            {provinces.map((p) => <option key={p}>{p}</option>)}
          </Select>
        )}
        {branches.length > 1 && (
          <Select label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b}>{b}</option>)}
          </Select>
        )}
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={staff} onChange={(e) => setStaff(e.target.checked)} />
          Include staff loans
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-2">Sections</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {sections.map((x) => (
            <label key={x.key} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2">
              <input
                type="checkbox"
                checked={secs.has(x.key)}
                onChange={(e) => {
                  const n = new Set(secs);
                  if (e.target.checked) n.add(x.key);
                  else n.delete(x.key);
                  setSecs(n);
                }}
              />
              {x.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <a className={buttonClass()} href={`/report?${query}`}>
          <Eye className="h-4 w-4" aria-hidden /> Preview report
        </a>
        <a className={buttonClass("secondary")} href={`/api/reports/pdf?${query}`}>
          <Download className="h-4 w-4" aria-hidden /> Download PDF
        </a>
        <a className={buttonClass("secondary")} href={`/api/reports/xlsx?${query}`}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden /> Download Excel
        </a>
      </div>
    </div>
  );
}
