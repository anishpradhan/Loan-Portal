import Link from "next/link";
import { formatCompactNPR, formatNPR } from "@/domain/money";

export interface BarItem {
  label: string;
  value: number; // paisa or ratio
  sub?: string;
  href?: string;
}

/**
 * Ranked horizontal bars in HTML: one hue, value labels in text ink,
 * native tooltip with the exact figure. Accessible as a list.
 */
export function BarList({ items, kind = "money" }: { items: BarItem[]; kind?: "money" | "pct" }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const fmt = (v: number) => (kind === "pct" ? `${(v * 100).toFixed(1)}%` : formatCompactNPR(v));
  const exact = (v: number) => (kind === "pct" ? `${(v * 100).toFixed(2)}%` : `Rs. ${formatNPR(v)}`);
  return (
    <ol className="space-y-2.5">
      {items.map((it) => {
        const row = (
          <div className="group" title={`${it.label}: ${exact(it.value)}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-ink group-hover:text-accent">{it.label}</span>
              <span className="num shrink-0 font-medium text-ink">{fmt(it.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full bg-[var(--series-1)]" style={{ width: `${Math.max(1, (Math.abs(it.value) / max) * 100)}%` }} />
            </div>
            {it.sub && <div className="mt-0.5 text-xs text-muted">{it.sub}</div>}
          </div>
        );
        return <li key={it.label}>{it.href ? <Link href={it.href}>{row}</Link> : row}</li>;
      })}
    </ol>
  );
}
