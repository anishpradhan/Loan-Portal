import clsx from "clsx";
import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  pad = true,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={clsx("rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.03)] avoid-break", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  delta,
  deltaGoodWhen = "down",
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** signed change vs comparison snapshot, pre-formatted text + direction */
  delta?: { text: string; direction: "up" | "down" | "flat" } | null;
  deltaGoodWhen?: "up" | "down";
  href?: string;
}) {
  const good = delta && delta.direction !== "flat" && delta.direction === deltaGoodWhen;
  const body = (
    <div className="rounded-xl border border-border bg-surface p-4 h-full transition-colors hover:border-accent/40">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-ink num text-left">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
        {delta && (
          <span className={clsx("font-medium", delta.direction === "flat" ? "text-muted" : good ? "text-good-text" : "text-critical-text")}>
            {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "•"} {delta.text}
          </span>
        )}
        {sub && <span className="text-muted">{sub}</span>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Tabs({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav className="mb-4 flex gap-1 border-b border-border no-print" aria-label="Views">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={clsx(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink",
          )}
          aria-current={t.key === active ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "error" | "success"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "info" && "border-accent/30 bg-accent-soft text-ink",
        tone === "warning" && "border-warning/50 bg-warning/10 text-ink",
        tone === "error" && "border-critical/40 bg-critical/10 text-ink",
        tone === "success" && "border-good/40 bg-good/10 text-ink",
      )}
    >
      {children}
    </div>
  );
}
