import { auth } from "@clerk/nextjs/server";
import { AnalysisForm } from "@/components/analysis-form";
import { WorkspaceAnalyses, type WorkspaceAnalysis } from "@/components/workspace-analyses";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

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
  const { data: rows, error } = await supabase
    .from("analyses")
    .select("id, status, stage, stage_message, error_message, commit_sha, started_at, completed_at, created_at, project:projects!analyses_organization_id_project_id_fkey(name, repository_url)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load workspace analyses", {
      code: error.code,
      message: error.message,
      organizationId: orgId,
    });
  }

  const analyses: WorkspaceAnalysis[] = (rows ?? []).flatMap((analysis) => {
    const project = Array.isArray(analysis.project) ? analysis.project[0] : analysis.project;
    if (!project) return [];
    return [{
      id: analysis.id,
      status: analysis.status,
      stage: analysis.stage,
      stageMessage: analysis.stage_message,
      errorMessage: analysis.error_message,
      commitSha: analysis.commit_sha,
      startedAt: analysis.started_at,
      completedAt: analysis.completed_at,
      createdAt: analysis.created_at,
      projectName: project.name,
      repositoryUrl: project.repository_url,
    }];
  });

  const completedCount = analyses.filter((analysis) => analysis.status === "completed").length;
  const failedCount = analyses.filter((analysis) => analysis.status === "failed").length;

  return (
    <div className="workspace-content">
      <header className="analysis-heading">
        <div className="analysis-title-line">
          <h1>{organizationName}</h1>
          <span className="analysis-count">{analyses.length} analyses</span>
        </div>
        <AnalysisForm />
        <div className="analysis-summary" aria-label={`${completedCount} complete, ${failedCount} failed`}>
          <span><i className="analysis-summary__dot analysis-summary__dot--complete" aria-hidden="true" />{completedCount} complete</span>
          <span><i className="analysis-summary__dot analysis-summary__dot--failed" aria-hidden="true" />{failedCount} failed</span>
        </div>
      </header>

      {error ? (
        <Alert variant="destructive" className="inline-alert"><AlertDescription>Analyses could not be loaded. Check the Supabase connection and organization token configuration.</AlertDescription></Alert>
      ) : analyses.length ? (
        <WorkspaceAnalyses analyses={analyses} />
      ) : (
        <Empty className="analysis-empty-state">
          <EmptyMedia variant="icon"><span aria-hidden="true">⌁</span></EmptyMedia>
          <EmptyHeader><span className="eyebrow">NO ANALYSES FOUND</span><EmptyTitle>No analyses for {organizationName}.</EmptyTitle><EmptyDescription>Paste a public GitHub repository above to create the first map for this team.</EmptyDescription></EmptyHeader>
        </Empty>
      )}
      <span className="sr-only" data-organization-id={orgId}>Active organization loaded</span>
    </div>
  );
}
