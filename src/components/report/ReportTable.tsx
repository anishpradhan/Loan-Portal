import clsx from "clsx";

export interface RCol<T> {
  label: string;
  num?: boolean;
  cell: (row: T) => React.ReactNode;
  foot?: React.ReactNode;
}

/** Compact, print-friendly table for the management report. */
export function ReportTable<T>({ cols, rows, foot }: { cols: RCol<T>[]; rows: T[]; foot?: boolean }) {
  return (
    <table className="w-full border-collapse text-[11px] leading-snug">
      <thead>
        <tr className="border-b-2 border-[#1c3a63] text-left">
          {cols.map((c, i) => (
            <th key={i} className={clsx("px-1.5 py-1 font-semibold text-[#1c3a63]", c.num && "text-right")}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-[#e3e2dd] even:bg-[#f8f8f6]" style={{ breakInside: "avoid" }}>
            {cols.map((c, j) => (
              <td key={j} className={clsx("px-1.5 py-[3px]", c.num ? "num" : j === 0 && "whitespace-nowrap")}>{c.cell(r)}</td>
            ))}
          </tr>
        ))}
        {/* Total row lives in tbody so print engines don't repeat it on every page */}
        {foot && (
          <tr className="border-t-2 border-[#1c3a63] font-semibold" style={{ breakInside: "avoid" }}>
            {cols.map((c, j) => (
              <td key={j} className={clsx("px-1.5 py-1 whitespace-nowrap", c.num && "num")}>{c.foot}</td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}
