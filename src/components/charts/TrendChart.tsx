"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNPR } from "@/domain/money";

export interface TrendDatum {
  label: string;
  value: number; // paisa, or a ratio when kind = "pct"
}

/** Single-series trend (one hue, no legend; the card title names it). */
export function TrendChart({ data, kind = "money", height = 220 }: { data: TrendDatum[]; kind?: "money" | "pct"; height?: number }) {
  // Axis in Crore; decimals follow the visible range so ticks stay distinct
  const values = data.map((d) => d.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = kind === "pct" ? (hi - lo) * 100 : (hi - lo) / 1e9;
  const decimals = span >= 10 ? 0 : span >= 1 ? 1 : 2;
  const pad = hi === lo ? Math.abs(hi) * 0.05 || 1 : 0;
  const fmtAxis = (v: number) =>
    kind === "pct"
      ? `${(v * 100).toFixed(decimals)}%`
      : `${(v / 1e9).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} Cr`;
  const fmtTip = (v: number) => (kind === "pct" ? `${(v * 100).toFixed(2)}%` : `Rs. ${formatNPR(v)}`);
  if (data.length < 2) {
    return (
      <div className="grid place-items-center text-sm text-muted" style={{ height }}>
        A trend appears once two or more snapshots are imported.
      </div>
    );
  }
  return (
    <div style={{ height }} role="img" aria-label="Trend chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={24} />
          <YAxis tickFormatter={fmtAxis} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={104} domain={pad ? [lo - pad, hi + pad] : ["auto", "auto"]} tickCount={5} />
          <Tooltip
            formatter={(v) => [fmtTip(Number(v)), ""]}
            separator=""
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" }}
            labelStyle={{ color: "var(--text-2)" }}
            cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
          />
          <Area type="monotone" dataKey="value" stroke="var(--series-1)" strokeWidth={2} fill="url(#trendFill)" dot={{ r: 3, fill: "var(--series-1)", strokeWidth: 0 }} activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
