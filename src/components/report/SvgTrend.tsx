import { formatCompactNPR } from "@/domain/money";

/**
 * Static SVG line chart for the printable report (renders identically in
 * the browser, print and PDF; no client JavaScript needed).
 */
export function SvgTrend({
  points,
  kind = "money",
  width = 640,
  height = 180,
  title,
}: {
  points: { label: string; value: number }[];
  kind?: "money" | "pct";
  width?: number;
  height?: number;
  title: string;
}) {
  if (points.length < 2) return <p className="text-sm text-muted">A trend needs at least two snapshots.</p>;
  const pad = { l: 64, r: 16, t: 12, b: 26 };
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo -= Math.abs(lo) * 0.05 || 1;
    hi += Math.abs(hi) * 0.05 || 1;
  } else {
    const m = (hi - lo) * 0.1;
    lo -= m;
    hi += m;
  }
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * w;
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * h;
  // Tick precision follows the visible range so ticks never repeat
  const span = kind === "pct" ? (hi - lo) * 100 : (hi - lo) / 1e9;
  const dec = span >= 10 ? 0 : span >= 1 ? 1 : 2;
  const fmt = (v: number) =>
    kind === "pct" ? `${(v * 100).toFixed(dec)}%` : `${(v / 1e9).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec })} Cr`;
  const fmtLast = (v: number) => (kind === "pct" ? `${(v * 100).toFixed(2)}%` : formatCompactNPR(v));
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${pad.t + h} L${pad.l},${pad.t + h} Z`;
  const every = Math.ceil(points.length / 8);
  const last = points.at(-1)!;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={title} style={{ maxWidth: width }}>
      <title>{title}</title>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="#e6e5e0" />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#7a7974">{fmt(t)}</text>
        </g>
      ))}
      <path d={area} fill="#2a78d6" opacity="0.08" />
      <path d={path} fill="none" stroke="#2a78d6" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3" fill="#2a78d6" />
          {i % every === 0 || i === points.length - 1 ? (
            <text x={x(i)} y={height - 8} textAnchor="middle" fontSize="9" fill="#7a7974">{p.label}</text>
          ) : null}
        </g>
      ))}
      <text x={x(points.length - 1) - 4} y={y(last.value) - 8} textAnchor="end" fontSize="10" fontWeight="600" fill="#16161a">{fmtLast(last.value)}</text>
    </svg>
  );
}
