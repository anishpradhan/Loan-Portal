import { CLASS_STYLE } from "@/components/ui/ClassBadge";
import { formatCompactNPR, formatNPR } from "@/domain/money";
import { PROVISION_BUCKETS, type LoanClass } from "@/domain/provisioning";

/**
 * Outstanding by loan class as one segmented bar plus a labelled legend table,
 * so identity never relies on colour alone.
 */
export function ClassComposition({
  outstanding,
  counts,
  provision,
}: {
  outstanding: Record<LoanClass, number>;
  counts: Record<LoanClass, number>;
  provision: Record<LoanClass, number>;
}) {
  const total = Object.values(outstanding).reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Outstanding by loan class">
        {PROVISION_BUCKETS.map((b) => {
          const w = (outstanding[b.cls] / total) * 100;
          if (w <= 0) return null;
          return (
            <div
              key={b.cls}
              title={`${CLASS_STYLE[b.cls].label}: Rs. ${formatNPR(outstanding[b.cls])} (${w.toFixed(2)}%)`}
              style={{ width: `${Math.max(w, 0.6)}%`, background: CLASS_STYLE[b.cls].color }}
            />
          );
        })}
      </div>
      <table className="mt-4 w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1 text-left font-medium">Class (DPD)</th>
            <th className="py-1 text-right font-medium">Loans</th>
            <th className="py-1 text-right font-medium">Outstanding</th>
            <th className="py-1 text-right font-medium">Share</th>
            <th className="py-1 text-right font-medium">Provision</th>
          </tr>
        </thead>
        <tbody>
          {PROVISION_BUCKETS.map((b, i) => {
            const lo = i === 0 ? 0 : PROVISION_BUCKETS[i - 1].maxDpd + 1;
            const range = Number.isFinite(b.maxDpd) ? `${lo}–${b.maxDpd}` : `>${PROVISION_BUCKETS[i - 1].maxDpd}`;
            return (
              <tr key={b.cls} className="border-t border-border">
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLASS_STYLE[b.cls].color }} aria-hidden />
                    {CLASS_STYLE[b.cls].label} <span className="text-muted">({range}, {b.rate * 100}%)</span>
                  </span>
                </td>
                <td className="num">{counts[b.cls].toLocaleString("en-IN")}</td>
                <td className="num" title={`Rs. ${formatNPR(outstanding[b.cls])}`}>{formatCompactNPR(outstanding[b.cls])}</td>
                <td className="num">{((outstanding[b.cls] / total) * 100).toFixed(2)}%</td>
                <td className="num" title={`Rs. ${formatNPR(provision[b.cls])}`}>{formatCompactNPR(provision[b.cls])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
