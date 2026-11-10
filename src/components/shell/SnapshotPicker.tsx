"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface SnapshotOption {
  id: number;
  label: string;
}

export function SnapshotPicker({
  options,
  current,
  previous,
}: {
  options: SnapshotOption[];
  current: number | null;
  previous: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function set(key: "s" | "vs", value: string) {
    const next = new URLSearchParams(sp.toString());
    next.set(key, value);
    if (key === "s") next.delete("vs"); // comparison defaults to the snapshot before
    router.push(`${pathname}?${next.toString()}`);
  }

  if (!options.length) return null;
  const idx = options.findIndex((o) => o.id === current);
  const older = idx >= 0 ? options.slice(idx + 1) : [];

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-muted">As of</span>
        <select
          value={current ?? ""}
          onChange={(e) => set("s", e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-ink"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-muted">vs</span>
        <select
          value={previous ?? ""}
          onChange={(e) => set("vs", e.target.value)}
          disabled={!older.length}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-ink disabled:opacity-50"
        >
          {!older.length && <option value="">No earlier snapshot</option>}
          {older.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
