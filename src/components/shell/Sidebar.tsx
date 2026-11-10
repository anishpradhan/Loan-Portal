"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlertTriangle, ArrowLeftRight, BarChart3, Building2, FileText, HandCoins, History,
  LayoutDashboard, Search, ShieldCheck, Target, Upload, Users, Package,
} from "lucide-react";

const ICONS = {
  dashboard: LayoutDashboard, portfolio: BarChart3, movement: ArrowLeftRight, recovery: HandCoins,
  provisioning: ShieldCheck, budget: Target, exceptions: AlertTriangle, accounts: Search,
  reports: FileText, import: Upload, branches: Building2, products: Package, users: Users, audit: History,
} as const;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

export function Sidebar({ main, admin }: { main: NavItem[]; admin: NavItem[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  // keep the selected snapshots while moving between analysis pages
  const keep = new URLSearchParams();
  for (const k of ["s", "vs"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString();

  const link = (item: NavItem, carry: boolean) => {
    const Icon = ICONS[item.icon];
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={carry && qs ? `${item.href}?${qs}` : item.href}
        aria-current={active ? "page" : undefined}
        className={clsx(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          active ? "bg-sidebar-active text-white" : "text-sidebar-text hover:bg-sidebar-active/60 hover:text-white",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col gap-1 px-3" aria-label="Main">
      {main.map((i) => link(i, true))}
      {admin.length > 0 && (
        <>
          <div className="mt-5 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-text/60">Administration</div>
          {admin.map((i) => link(i, false))}
        </>
      )}
    </nav>
  );
}
