import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { AnalysisProgress } from "@/components/analysis-progress";
import { CanvasPreviewShell } from "@/components/canvas-preview-shell";
import { WorkspaceShell } from "@/components/workspace-shell";
import { normalizeStoredParseResult } from "@/lib/parser/validate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AnalysisPage({ params }: PageProps<"/analysis/[analysisId]">) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/workspace");
  const { analysisId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: analysis, error } = await supabase.from("analyses")
    .select("id, status, stage, stage_message, failed_stage, error_message, started_at, completed_at, created_at, commit_sha, project:projects!analyses_organization_id_project_id_fkey(name, repository_url)")
    .eq("id", analysisId)
    .maybeSingle();
  if (error) throw new Error(`Could not load this analysis: ${error.message}`);
  if (!analysis) notFound();
  const project = Array.isArray(analysis.project) ? analysis.project[0] : analysis.project;
  if (!project) notFound();

  if (analysis.status === "completed") {
    const { data: graph, error: graphError } = await supabase.rpc("get_analysis_graph", { p_analysis_id: analysis.id });
    if (graphError) throw new Error(`Could not load the stored dependency graph: ${graphError.message}`);
    const parsedGraph = normalizeStoredParseResult(graph);
    if (!parsedGraph) throw new Error("The stored analysis does not match the parser contract.");
    return <CanvasPreviewShell analysis={parsedGraph} repositoryUrl={project.repository_url} repositoryName={project.name} commitSha={analysis.commit_sha} />;
  }

  const startedAt = analysis.started_at ?? analysis.created_at;
  return (
    <WorkspaceShell>
      <AnalysisProgress
        key={analysis.stage}
        analysisId={analysis.id}
        repositoryName={project.name}
        commitSha={analysis.commit_sha}
        initialStage={analysis.stage}
        initialMessage={analysis.stage_message}
        errorMessage={analysis.error_message}
        failedStage={analysis.failed_stage}
        startedAt={startedAt}
        active={analysis.status === "running" || analysis.status === "queued"}
        repositoryUrl={project.repository_url}
      />
    </WorkspaceShell>
  );
}
