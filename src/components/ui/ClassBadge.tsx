import clsx from "clsx";
import type { LoanClass } from "@/domain/provisioning";

/** Loan classification uses the reserved status palette, always with a text label. */
export const CLASS_STYLE: Record<LoanClass, { label: string; dot: string; color: string }> = {
  PASS: { label: "Pass", dot: "bg-good", color: "var(--good)" },
  SUBSTANDARD: { label: "Substandard", dot: "bg-warning", color: "var(--warning)" },
  DOUBTFUL: { label: "Doubtful", dot: "bg-serious", color: "var(--serious)" },
  BAD: { label: "Bad", dot: "bg-critical", color: "var(--critical)" },
};

export function ClassBadge({ cls, className }: { cls: LoanClass | null | undefined; className?: string }) {
  if (!cls) return <span className="text-muted">—</span>;
  const s = CLASS_STYLE[cls];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span className={clsx("h-2 w-2 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}
