import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Sidebar, type NavItem } from "@/components/shell/Sidebar";
import { logoutAction } from "@/server/auth/actions";
import { requireUser, ROLE_LABELS } from "@/server/auth/session";
import { scopeFor } from "@/server/auth/scope";

const MAIN: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/portfolio", label: "Portfolio", icon: "portfolio" },
  { href: "/movement", label: "Movement", icon: "movement" },
  { href: "/recovery", label: "Recovery", icon: "recovery" },
  { href: "/provisioning", label: "Provisioning", icon: "provisioning" },
  { href: "/budget", label: "Budget vs Actual", icon: "budget" },
  { href: "/exceptions", label: "Watchlist", icon: "exceptions" },
  { href: "/accounts", label: "Account Search", icon: "accounts" },
  { href: "/reports", label: "Reports", icon: "reports" },
];

const ADMIN: NavItem[] = [
  { href: "/admin/import", label: "Import Data", icon: "import" },
  { href: "/admin/branches", label: "Branches", icon: "branches" },
  { href: "/admin/products", label: "Products", icon: "products" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/audit", label: "Audit Log", icon: "audit" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const scope = await scopeFor(user);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="no-print bg-sidebar lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-sm font-semibold text-white">LP</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-white">Loan Portfolio</div>
            <div className="text-xs text-sidebar-text">Monitoring &amp; Reporting</div>
          </div>
        </div>
        <Suspense>
          <Sidebar main={MAIN} admin={user.role === "ADMIN" ? ADMIN : []} />
        </Suspense>
        <div className="mt-6 border-t border-white/10 px-6 py-4 text-xs text-sidebar-text">
          <div className="font-medium text-white">{user.fullName}</div>
          <div>{ROLE_LABELS[user.role]}</div>
          <div className="mt-0.5 opacity-80">{scope.label}</div>
          <div className="mt-3 flex gap-3">
            <Link href="/account/password" className="hover:text-white underline-offset-2 hover:underline">
              Change password
            </Link>
            <form action={logoutAction}>
              <button className="inline-flex items-center gap-1 hover:text-white">
                <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">{children}</main>
    </div>
  );
}
