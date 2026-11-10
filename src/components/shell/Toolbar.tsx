import Link from "next/link";
import clsx from "clsx";
import { Suspense } from "react";
import { SnapshotPicker } from "./SnapshotPicker";
import type { PageContext } from "@/server/pageContext";
import { hrefWith } from "@/server/pageContext";

/** Snapshot selector plus the staff-loan toggle, shown above analysis pages. */
export function Toolbar({ ctx, path, staffToggle = true }: { ctx: PageContext; path: string; staffToggle?: boolean }) {
  const staff = ctx.params.staff === "1";
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 no-print">
      <Suspense>
        <SnapshotPicker {...ctx.picker} />
      </Suspense>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">{ctx.scope.label}</span>
        {staffToggle && (
          <Link
            href={hrefWith(path, ctx.params, { staff: staff ? null : "1" })}
            className={clsx(
              "rounded-full border px-3 py-1 text-xs font-medium",
              staff ? "border-accent bg-accent-soft text-accent" : "border-border text-ink-2 hover:bg-surface-2",
            )}
            aria-pressed={staff}
          >
            {staff ? "Including staff loans" : "Excluding staff loans"}
          </Link>
        )}
      </div>
    </div>
  );
}
