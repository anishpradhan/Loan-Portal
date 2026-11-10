import { DataTable } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/primitives";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/session";

export const metadata = { title: "Audit Log" };

export default async function AuditPage() {
  await requireRole("ADMIN");
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 2000, include: { user: true } });
  return (
    <>
      <PageHeader title="Audit Log" subtitle="Most recent 2,000 events: sign-ins, imports, edits, report exports and account views." />
      <DataTable
        exportName="audit-log"
        pageSize={100}
        columns={[
          { key: "at", label: "When" },
          { key: "user", label: "User" },
          { key: "action", label: "Action" },
          { key: "entity", label: "Entity" },
          { key: "detail", label: "Detail" },
        ]}
        rows={logs.map((l) => ({
          at: l.createdAt.toISOString().slice(0, 19).replace("T", " ") + " UTC",
          user: l.user?.username ?? "—",
          action: l.action,
          entity: [l.entity, l.entityId].filter(Boolean).join(" #"),
          detail: l.detail ? JSON.stringify(l.detail).slice(0, 160) : "",
        }))}
      />
    </>
  );
}
