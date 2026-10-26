import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const instant = false;

const statusLabels: Record<string, string> = {
  queued: "Queued",
  running: "In progress",
  completed: "Complete",
  failed: "Failed",
};

function formatDate(value: string) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000], ["month", 2_592_000], ["day", 86_400],
    ["hour", 3_600], ["minute", 60], ["second", 1],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const [unit, duration] = units.find(([, size]) => Math.abs(seconds) >= size) ?? units[units.length - 1];
  return formatter.format(Math.round(seconds / duration), unit);
}

export default async function WorkspacePage() {
  const { userId, orgId, orgSlug, sessionClaims } = await auth();
  if (!userId) return null;

  if (!orgId) {
    return (
      <div className="workspace-content">
        <Empty className="analysis-empty-state">
          <EmptyHeader><span className="eyebrow">ORGANIZATION NEEDED</span><EmptyTitle>Choose a team to see its analyses.</EmptyTitle><EmptyDescription>Use the organization menu to switch to a team workspace.</EmptyDescription></EmptyHeader>
        </Empty>
      </div>
    );
  }

  const organizationName = typeof sessionClaims?.org_name === "string"
    ? sessionClaims.org_name
    : orgSlug || "your organization";

  const supabase = await createSupabaseServerClient();
  const { data: analyses, error } = await supabase
    .from("analyses")
    .select("id, status, started_at, completed_at, created_at, project:projects!analyses_organization_id_project_id_fkey(name, repository_url)")
    .order("created_at", { ascending: false });

  return (
    <div className="workspace-content">
      <header className="analysis-heading">
        <div className="analysis-title-line">
          <h1>{organizationName}</h1>
          <span className="analysis-count">{analyses?.length ?? 0} analyses</span>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive" className="inline-alert"><AlertDescription>Analyses could not be loaded. Check the Supabase connection and organization token configuration.</AlertDescription></Alert>
      ) : analyses?.length ? (
        <section className="analysis-list" aria-label="Repository analyses">
          <Table className="analysis-table">
            <TableHeader><TableRow><TableHead>Repository</TableHead><TableHead>State</TableHead><TableHead>Commit</TableHead><TableHead>Started</TableHead><TableHead>Finished</TableHead></TableRow></TableHeader>
            <TableBody>
            {analyses.map((analysis) => {
              const project = Array.isArray(analysis.project) ? analysis.project[0] : analysis.project;
              const status = statusLabels[analysis.status] ?? analysis.status;
              return (
                <TableRow className="analysis-row" key={analysis.id}>
                  <TableCell className="analysis-repository"><strong>{project?.repository_url?.replace(/^https?:\/\/(www\.)?github\.com\//, "") ?? project?.name ?? "Repository"}</strong></TableCell>
                  <TableCell><Badge className={`analysis-badge analysis-badge--${analysis.status}`} variant="outline"><span aria-hidden="true" />{status.toLowerCase()}</Badge></TableCell>
                  <TableCell className="analysis-commit">—</TableCell>
                  <TableCell className="analysis-date"><time dateTime={analysis.started_at ?? analysis.created_at}>{formatDate(analysis.started_at ?? analysis.created_at)}</time></TableCell>
                  <TableCell className="analysis-date">{analysis.completed_at ? <time dateTime={analysis.completed_at}>{formatDate(analysis.completed_at)}</time> : "—"}</TableCell>
                </TableRow>
              );
            })}
            </TableBody>
          </Table>
        </section>
      ) : (
        <Empty className="analysis-empty-state">
          <EmptyMedia variant="icon"><span aria-hidden="true">⌁</span></EmptyMedia>
          <EmptyHeader><span className="eyebrow">NO ANALYSES YET</span><EmptyTitle>Your team’s maps will show up here.</EmptyTitle><EmptyDescription>When someone runs an analysis, its repository and current state will be available to everyone in this organization.</EmptyDescription></EmptyHeader>
        </Empty>
      )}
      <span className="sr-only" data-organization-id={orgId}>Active organization loaded</span>
    </div>
  );
}
