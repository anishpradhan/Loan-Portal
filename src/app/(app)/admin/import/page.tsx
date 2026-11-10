import { DataTable } from "@/components/ui/DataTable";
import { Card, PageHeader } from "@/components/ui/primitives";
import { toBs } from "@/domain/nepali";
import { fmtDateTime, snapshotLabel } from "@/lib/dates";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/session";
import { deleteSnapshotAction } from "@/server/actions/admin";
import { ImportWizard } from "./ImportWizard";
import { DeleteSnapshotButton } from "./DeleteSnapshotButton";

export const metadata = { title: "Import Data" };

export default async function ImportPage() {
  await requireRole("ADMIN");
  const snapshots = await prisma.snapshot.findMany({ orderBy: { asOf: "desc" }, include: { uploadedBy: true } });
  return (
    <>
      <PageHeader title="Import Data" subtitle="Each Loan Master List export becomes a dated snapshot. History is kept so trends and movement can be analysed." />
      <Card title="Upload">
        <ImportWizard defaultFiscalYear={toBs(new Date()).fiscalYear} />
      </Card>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Imported snapshots</h2>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-3 py-2">As of</th>
              <th className="px-3 py-2 text-right">Loans</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Imported</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {snapshots.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">Nothing imported yet.</td></tr>}
            {snapshots.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{snapshotLabel(s.asOf)}</td>
                <td className="px-3 py-2 num">{s.rowCount.toLocaleString("en-IN")}</td>
                <td className="px-3 py-2 text-ink-2">{s.sourceFile}</td>
                <td className="px-3 py-2 text-ink-2">{new Date(s.createdAt).toLocaleString("en-GB")} · {s.uploadedBy?.fullName ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <DeleteSnapshotButton id={s.id} label={fmtDateTime(s.asOf)} action={deleteSnapshotAction} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-8">
        <Card title="Template for the branch directory" subtitle="Optional: upload a sheet with these headers to update provinces, emails and province managers">
          <DataTable
            searchable={false}
            columns={[
              { key: "a", label: "Code" }, { key: "b", label: "Branch Name" }, { key: "c", label: "Province" },
              { key: "d", label: "Branch Email" }, { key: "e", label: "Province Email" }, { key: "f", label: "Province Manager" },
            ]}
            rows={[{ a: "001", b: "Main Branch", c: "Bagmati Inside Valley", d: "main@example.coop", e: "bagmati@example.coop", f: "Name" }]}
          />
        </Card>
      </div>
    </>
  );
}
