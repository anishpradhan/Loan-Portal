import "server-only";
import { requireUser, type SessionUser } from "@/server/auth/session";
import { scopeFor, type Scope } from "@/server/auth/scope";
import { getPositions, resolveSnapshots, type SnapshotInfo } from "@/server/repo/positions";
import type { LoanPosition } from "@/domain/loan";
import { snapshotLabel } from "@/lib/dates";
import type { SnapshotOption } from "@/components/shell/SnapshotPicker";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export interface PageContext {
  user: SessionUser;
  scope: Scope;
  current: SnapshotInfo | null;
  previous: SnapshotInfo | null;
  positions: LoanPosition[];
  previousPositions: LoanPosition[] | null;
  picker: { options: SnapshotOption[]; current: number | null; previous: number | null };
  params: Record<string, string>;
}

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Everything an analysis page needs: who, what they may see, which snapshots. */
export async function loadContext(searchParams: SearchParams, opts: { withPrevious?: boolean } = {}): Promise<PageContext> {
  const raw = await searchParams;
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const x = one(v);
    if (x !== undefined) params[k] = x;
  }
  const user = await requireUser();
  const scope = await scopeFor(user);
  const { all, current, previous } = await resolveSnapshots({ s: params.s, vs: params.vs });
  const positions = current ? await getPositions(current.id, scope) : [];
  const previousPositions = opts.withPrevious && previous ? await getPositions(previous.id, scope) : null;
  return {
    user,
    scope,
    current,
    previous,
    positions,
    previousPositions,
    picker: {
      options: all.map((s) => ({ id: s.id, label: snapshotLabel(s.asOf) })),
      current: current?.id ?? null,
      previous: previous?.id ?? null,
    },
    params,
  };
}

/** Builds a URL for the same page with some params changed. */
export function hrefWith(path: string, params: Record<string, string>, change: Record<string, string | null>): string {
  const p = new URLSearchParams(params);
  for (const [k, v] of Object.entries(change)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}
