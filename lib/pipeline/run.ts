import "server-only";

import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRepository } from "@/lib/parser/index";
import type { ParseResult } from "@/lib/parser/types";
import { fetchGitHubRepository, parseGitHubRepository } from "@/lib/pipeline/github";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PipelineStage = "fetching" | "selecting" | "parsing" | "storing" | "completed";

export interface PipelineResult {
  analysisId: string;
  status: "existing" | "queued" | "completed";
  commitSha?: string;
}

export interface PreparedAnalysis {
  analysisId: string;
  status: "existing" | "queued";
}

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function updateStage(
  supabase: SupabaseClient,
  analysisId: string,
  stage: PipelineStage,
  message: string,
): Promise<void> {
  const { error } = await supabase.from("analyses").update({ stage, stage_message: message }).eq("id", analysisId);
  throwIfError(error, `Could not update pipeline stage to ${stage}`);
}

async function recordRerunResetFailure(supabase: SupabaseClient, analysisId: string, error: unknown): Promise<never> {
  const detail = error instanceof Error ? error.message : "An unknown error interrupted the rerun reset.";
  const message = `Could not clear the previous analysis data: ${detail}`;
  const { error: stateError } = await supabase.from("analyses").update({
    status: "failed",
    stage: "failed",
    stage_message: message,
    error_message: message,
    failed_stage: "queued",
    completed_at: new Date().toISOString(),
  }).eq("id", analysisId).eq("status", "queued");
  throwIfError(stateError, "Could not record the failed analysis rerun");
  throw new Error(message);
}

async function storeParseResult(supabase: SupabaseClient, organizationId: string, analysisId: string, result: ParseResult): Promise<void> {
  const fileIds = new Map<string, string>();

  for (let offset = 0; offset < result.files.length; offset += 250) {
    const batch = result.files.slice(offset, offset + 250);
    const { data, error } = await supabase.from("files").insert(batch.map((file) => ({
      organization_id: organizationId,
      analysis_id: analysisId,
      path: file.path,
      language: file.extension.replace(/^\./, ""),
      content_hash: file.hash,
      role: file.role,
      module: file.module,
      extension: file.extension,
      lines: file.lines,
      fan_in: file.fanIn,
      fan_out: file.fanOut,
      entry_point_reason: file.entryPointReason,
    }))).select("id, path");
    throwIfError(error, "Could not store parsed files");
    for (const row of data ?? []) fileIds.set(row.path, row.id);
  }

  const edgeRows = result.edges.flatMap((edge) => {
    const sourceFileId = fileIds.get(edge.from);
    const targetFileId = fileIds.get(edge.to);
    if (!sourceFileId || !targetFileId) return [];
    return [{
      organization_id: organizationId,
      analysis_id: analysisId,
      source_file_id: sourceFileId,
      target_file_id: targetFileId,
      kind: edge.kind,
      specifier: edge.specifier,
      is_type_only: edge.isTypeOnly,
    }];
  });
  for (let offset = 0; offset < edgeRows.length; offset += 250) {
    const { error } = await supabase.from("edges").insert(edgeRows.slice(offset, offset + 250));
    throwIfError(error, "Could not store parsed dependencies");
  }

  const { error } = await supabase.from("analyses").update({
    coverage: result.coverage,
    skipped_files: result.skipped,
    parser_schema_version: result.schemaVersion,
    framework: result.framework,
    routes: result.routes,
  }).eq("id", analysisId);
  throwIfError(error, "Could not store parser coverage");
}

export async function prepareRepositoryAnalysis(repositoryUrl: string, rerun = false): Promise<PreparedAnalysis> {
  const { userId, orgId, sessionClaims } = await auth();
  if (!userId) throw new Error("Sign in before analysing a repository.");
  if (!orgId) throw new Error("Choose an organization before analysing a repository.");

  const repository = parseGitHubRepository(repositoryUrl);
  const supabase = await createSupabaseServerClient();
  const claimName = sessionClaims?.org_name;
  const organizationName = typeof claimName === "string" ? claimName : "Organization";
  const { error: organizationError } = await supabase.from("organizations").upsert({ id: orgId, name: organizationName }, { onConflict: "id" });
  throwIfError(organizationError, "Could not prepare the organization record");

  const { data: project, error: projectError } = await supabase.from("projects").upsert({
    organization_id: orgId,
    name: repository.name,
    repository_url: repository.canonicalUrl,
  }, { onConflict: "organization_id,repository_url" }).select("id").single();
  throwIfError(projectError, "Could not prepare the repository record");
  if (!project) throw new Error("Could not prepare the repository record.");

  const { data: existing, error: existingError } = await supabase.from("analyses")
    .select("id, status")
    .eq("organization_id", orgId)
    .eq("project_id", project.id)
    .maybeSingle();
  throwIfError(existingError, "Could not check for an existing analysis");
  if (existing) {
    if (!rerun || existing.status === "running" || existing.status === "queued") {
      return { analysisId: existing.id, status: "existing" };
    }
    // Claim the rerun before deleting rows. The conditional update makes concurrent
    // rerun requests observe the queued state instead of clearing the same graph.
    const { data: claimed, error: claimError } = await supabase.from("analyses").update({
      status: "queued",
      stage: "queued",
      stage_message: "Waiting to start the requested rerun.",
      failed_stage: null,
      error_message: null,
      commit_sha: null,
      coverage: {},
      skipped_files: [],
      framework: "generic",
      routes: [],
      parser_schema_version: null,
      files_found: null,
      files_parsed: null,
      files_skipped: null,
      started_at: new Date().toISOString(),
      completed_at: null,
    }).eq("id", existing.id).eq("status", existing.status).select("id").maybeSingle();
    throwIfError(claimError, "Could not prepare the analysis rerun");
    if (!claimed) return { analysisId: existing.id, status: "existing" };

    try {
      const { error: edgesError } = await supabase.from("edges").delete().eq("analysis_id", existing.id);
      throwIfError(edgesError, "Could not clear the previous dependencies");
      const { error: filesError } = await supabase.from("files").delete().eq("analysis_id", existing.id);
      throwIfError(filesError, "Could not clear the previous files");
    } catch (error) {
      return recordRerunResetFailure(supabase, existing.id, error);
    }
    return { analysisId: existing.id, status: "queued" };
  }

  const { data: analysis, error: analysisError } = await supabase.from("analyses").insert({
    organization_id: orgId,
    project_id: project.id,
    status: "queued",
    stage: "queued",
    stage_message: "Waiting to start the repository analysis.",
  }).select("id").single();
  if (analysisError?.code === "23505") {
    const { data: racedAnalysis, error: raceError } = await supabase.from("analyses")
      .select("id")
      .eq("organization_id", orgId)
      .eq("project_id", project.id)
      .maybeSingle();
    throwIfError(raceError, "Could not check the concurrent analysis");
    if (racedAnalysis) return { analysisId: racedAnalysis.id, status: "existing" };
  }
  throwIfError(analysisError, "Could not create an analysis record");
  if (!analysis) throw new Error("Could not create an analysis record.");

  return { analysisId: analysis.id, status: "queued" };
}

export async function runAnalysisPipeline(analysisId: string): Promise<PipelineResult> {
  const { userId, orgId } = await auth();
  if (!userId) throw new Error("Sign in before analysing a repository.");
  if (!orgId) throw new Error("Choose an organization before analysing a repository.");
  const supabase = await createSupabaseServerClient();
  const { data: analysis, error: readError } = await supabase.from("analyses")
    .select("id, status, project:projects!analyses_organization_id_project_id_fkey(repository_url)")
    .eq("id", analysisId)
    .maybeSingle();
  throwIfError(readError, "Could not load the queued analysis");
  if (!analysis) throw new Error("Analysis not found in the active organization.");
  const project = Array.isArray(analysis.project) ? analysis.project[0] : analysis.project;
  if (!project) throw new Error("The analysis repository could not be found.");
  if (analysis.status !== "queued") return { analysisId, status: "existing" };

  const { data: claimed, error: claimError } = await supabase.from("analyses").update({
    status: "running",
    stage: "fetching",
    stage_message: "Fetching the public repository archive.",
    started_at: new Date().toISOString(),
    completed_at: null,
    error_message: null,
    failed_stage: null,
  }).eq("id", analysisId).eq("status", "queued").select("id").maybeSingle();
  throwIfError(claimError, "Could not start the analysis");
  if (!claimed) return { analysisId, status: "existing" };

  let stage: PipelineStage = "fetching";
  let fetched: Awaited<ReturnType<typeof fetchGitHubRepository>> | undefined;
  try {
    const repository = parseGitHubRepository(project.repository_url);
    fetched = await fetchGitHubRepository(repository);
    stage = "selecting";
    await updateStage(supabase, analysisId, stage, "Selecting supported TypeScript and JavaScript source files.");
    stage = "parsing";
    await updateStage(supabase, analysisId, stage, "Parsing files and resolving imports.");
    const parsed = await parseRepository(fetched.directory);
    stage = "storing";
    await updateStage(supabase, analysisId, stage, "Storing parsed files, dependencies, framework roles, and routes.");
    await storeParseResult(supabase, orgId, analysisId, parsed);
    const { error: completeError } = await supabase.from("analyses").update({
      status: "completed",
      stage: "completed",
      stage_message: "Analysis complete.",
      commit_sha: fetched.commitSha,
      completed_at: new Date().toISOString(),
      files_found: parsed.filesFound,
      files_parsed: parsed.filesParsed,
      files_skipped: parsed.filesSkipped,
    }).eq("id", analysisId);
    throwIfError(completeError, "Could not finish the analysis");
    return { analysisId, status: "completed", commitSha: fetched.commitSha };
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error interrupted the analysis.";
    await supabase.from("edges").delete().eq("analysis_id", analysisId);
    await supabase.from("files").delete().eq("analysis_id", analysisId);
    const { error: failedStateError } = await supabase.from("analyses").update({
      status: "failed",
      stage: "failed",
      stage_message: message,
      failed_stage: stage,
      error_message: message,
      framework: "generic",
      routes: [],
      coverage: {},
      skipped_files: [],
      parser_schema_version: null,
      files_found: null,
      files_parsed: null,
      files_skipped: null,
      ...(fetched ? { commit_sha: fetched.commitSha } : {}),
      completed_at: new Date().toISOString(),
    }).eq("id", analysisId);
    throwIfError(failedStateError, `Analysis failed (${message}) and its failed state could not be stored`);
    throw error;
  } finally {
    await fetched?.cleanup();
  }
}

export async function runRepositoryPipeline(repositoryUrl: string): Promise<PipelineResult> {
  const prepared = await prepareRepositoryAnalysis(repositoryUrl);
  if (prepared.status === "existing") return prepared;
  return runAnalysisPipeline(prepared.analysisId);
}
