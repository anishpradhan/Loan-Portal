import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { loadContext, type SearchParams } from "@/server/pageContext";
import { REPORT_SECTIONS } from "@/server/views/report";
import { ReportBuilder } from "./ReportBuilder";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await loadContext(searchParams);
  if (!ctx.current) return <EmptyState title="No data imported yet" />;
  const provinces = [...new Set(ctx.positions.map((l) => l.province).filter((x): x is string => !!x))].sort();
  const branches = [...new Set(ctx.positions.map((l) => l.branch))].sort();
  return (
    <>
      <PageHeader
        title="Management Report"
        subtitle="A print-ready portfolio pack for senior management. Preview it, then download as PDF or Excel."
      />
      <Card>
        <ReportBuilder
          snapshots={ctx.picker.options}
          defaultCurrent={ctx.picker.current}
          defaultPrevious={ctx.picker.previous}
          provinces={ctx.scope.kind === "branch" ? [] : provinces}
          branches={branches}
          sections={REPORT_SECTIONS.map((s) => ({ key: s.key, label: s.label }))}
          initial={ctx.params}
        />
      </Card>
    </>
  );
}
