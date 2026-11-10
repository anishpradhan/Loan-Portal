import { PageHeader } from "@/components/ui/primitives";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/session";
import { toggleProductExclusionAction } from "@/server/actions/admin";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireRole("ADMIN");
  const products = await prisma.product.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { accounts: true } } } });
  return (
    <>
      <PageHeader title="Products" subtitle="Excluded products (staff loans) are left out of provisioning and, by default, out of portfolio analytics." />
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-3 py-2">Product (chart of account)</th>
              <th className="px-3 py-2 text-right">Accounts</th>
              <th className="px-3 py-2">Provisioning</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="px-3 py-2 num">{p._count.accounts.toLocaleString("en-IN")}</td>
                <td className="px-3 py-2">{p.excludeFromProvisioning ? <span className="text-muted">Excluded</span> : "Included"}</td>
                <td className="px-3 py-2 text-right">
                  <form action={toggleProductExclusionAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="text-xs text-accent hover:underline">{p.excludeFromProvisioning ? "Include" : "Exclude"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
