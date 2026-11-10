/**
 * Money is handled as integer paisa (1 NPR = 100 paisa) inside the domain
 * layer so that sums are exact. Values up to ~9e13 NPR are safe.
 */
export type Paisa = number;

export function toPaisa(value: number | string | { toString(): string } | null | undefined): Paisa {
  if (value === null || value === undefined || value === "") return 0;
  const s = typeof value === "number" ? value.toFixed(4) : value.toString().trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromPaisa(p: Paisa): number {
  return p / 100;
}

/** Multiply money by a rate and round to the nearest paisa. */
export function mulRate(p: Paisa, rate: number): Paisa {
  return Math.round(p * rate);
}

export function sum<T>(items: readonly T[], pick: (t: T) => Paisa): Paisa {
  let total = 0;
  for (const it of items) total += pick(it);
  return total;
}

/** Nepali digit grouping: 1,23,45,678.90 */
export function formatNPR(p: Paisa, opts: { decimals?: number; symbol?: boolean } = {}): string {
  const decimals = opts.decimals ?? 2;
  const neg = p < 0;
  const abs = Math.abs(p) / 100;
  const fixed = abs.toFixed(decimals);
  const [int, frac] = fixed.split(".");
  let grouped = int;
  if (int.length > 3) {
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    grouped = `${rest},${last3}`;
  }
  const body = frac ? `${grouped}.${frac}` : grouped;
  return `${neg ? "-" : ""}${opts.symbol ? "Rs. " : ""}${body}`;
}

/** Compact form for KPI tiles: 1.38 Arba, 45.2 Crore, 3.1 Lakh */
export function formatCompactNPR(p: Paisa): string {
  const v = Math.abs(p) / 100;
  const sign = p < 0 ? "-" : "";
  if (v >= 1e9) return `${sign}${(v / 1e9).toFixed(2)} Arba`;
  if (v >= 1e7) return `${sign}${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${sign}${(v / 1e5).toFixed(2)} Lakh`;
  return `${sign}${formatNPR(p, { decimals: 0 })}`;
}

export function pct(n: number, decimals = 2): string {
  return `${(n * 100).toFixed(decimals)}%`;
}
