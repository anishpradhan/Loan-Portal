"use client";

import clsx from "clsx";
import { useFormStatus } from "react-dom";

export function Field({
  label,
  hint,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      <input
        {...props}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      <select
        {...props}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
      >
        {children}
      </select>
    </label>
  );
}

export function SubmitButton({
  children,
  className,
  pendingText = "Working…",
  variant = "primary",
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={clsx(buttonClass(variant), "disabled:opacity-60", className)}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export function buttonClass(variant: "primary" | "secondary" | "danger" = "primary") {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40",
    variant === "primary" && "bg-accent text-on-accent hover:bg-accent-strong",
    variant === "secondary" && "border border-border bg-surface text-ink hover:bg-surface-2",
    variant === "danger" && "bg-critical text-white hover:opacity-90",
  );
}
