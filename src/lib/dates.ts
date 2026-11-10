import { bsLabel } from "@/domain/nepali";

/**
 * Report timestamps from core banking are local (Nepal) wall-clock times stored
 * without a zone, so they are always formatted as UTC to show them unchanged.
 */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toISOString().slice(0, 16).replace("T", " ");
}

/** "2026-11-05 (19 Kartik 2083)" */
export function fmtDual(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  const utcDay = new Date(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  return `${fmtDate(x)} (${bsLabel(utcDay)})`;
}

export function snapshotLabel(d: Date): string {
  return `${fmtDateTime(d)} · ${bsLabel(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))}`;
}

/** Calendar date of a snapshot as a local Date (for day arithmetic). */
export function snapshotDay(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
