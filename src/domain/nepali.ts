import NepaliDate from "nepali-date-converter";

/** Fiscal year runs Shrawan (month 1) to Ashad (month 12). */
export const FISCAL_MONTHS = [
  "Shrawan", "Bhadra", "Ashoj", "Kartik", "Mangsir", "Poush",
  "Magh", "Falgun", "Chaitra", "Baisakh", "Jestha", "Ashad",
] as const;

const SHRAWAN_INDEX = 3; // nepali-date-converter months are 0-based from Baisakh

export interface BsDate {
  year: number;
  month: number; // 1..12 calendar month (Baisakh = 1)
  day: number;
  fiscalYear: string; // "2083/84"
  fiscalMonth: number; // 1..12, Shrawan = 1
  label: string; // "19 Kartik 2083"
}

export function toBs(date: Date): BsDate {
  const nd = new NepaliDate(date);
  const y = nd.getYear();
  const m0 = nd.getMonth();
  const fyStart = m0 >= SHRAWAN_INDEX ? y : y - 1;
  return {
    year: y,
    month: m0 + 1,
    day: nd.getDate(),
    fiscalYear: `${fyStart}/${String((fyStart + 1) % 100).padStart(2, "0")}`,
    fiscalMonth: ((m0 - SHRAWAN_INDEX + 12) % 12) + 1,
    label: nd.format("DD MMMM YYYY"),
  };
}

export function bsLabel(date: Date | null | undefined): string {
  if (!date) return "";
  try {
    return toBs(date).label;
  } catch {
    return "";
  }
}

export function fiscalMonthName(m: number): string {
  return FISCAL_MONTHS[(m - 1 + 12) % 12];
}

/** AD date of the first day of a BS month (month0: 0 = Baisakh). */
function bsMonthStart(year: number, month0: number): Date {
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  const ad = new NepaliDate(y, m, 1).getAD();
  return new Date(ad.year, ad.month, ad.date);
}

export interface PeriodEnd {
  key: string;
  label: string;
  date: Date; // AD, local midnight
}

/**
 * Upcoming fiscal period ends after `from`: quarter ends (Ashoj, Poush,
 * Chaitra, Ashad) for the current fiscal year and the year end.
 */
export function upcomingPeriodEnds(from: Date): PeriodEnd[] {
  const bs = toBs(from);
  const fyStart = Number(bs.fiscalYear.slice(0, 4));
  // Each quarter ends the day before the next quarter's first month: Kartik, Magh, Baisakh, Shrawan (month0 counted from Baisakh of fyStart)
  const quarterStarts: [string, number, number][] = [
    ["Q1 end (Ashoj)", fyStart, 6],
    ["Q2 end (Poush)", fyStart, 9],
    ["Q3 end (Chaitra)", fyStart, 12],
    ["Year end (Ashad)", fyStart, 15],
  ];
  const out: PeriodEnd[] = [];
  for (const [label, y, m0] of quarterStarts) {
    const next = bsMonthStart(y, m0);
    const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
    if (end > from) out.push({ key: ymd(end), label: `${label} ${toBs(end).label}`, date: end });
  }
  return out;
}

/** Local calendar date as YYYY-MM-DD. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
