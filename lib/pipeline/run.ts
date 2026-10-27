import "server-only";

import { auth } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRepository } from "@/lib/parser/index";
import type { ParseResult } from "@/lib/parser/types";
import { fetchGitHubRepository, parseGitHubRepository } from "@/lib/pipeline/github";
import { createPipelineWriter } from "@/lib/supabase/pipeline-writer";

type PipelineStage = "fetching" | "selecting" | "parsing" | "storing" | "completed";

export interface PipelineResult {
  analysisId: string;
  status: "existing" | "completed";
  commitSha?: string;
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
  }).eq("id", analysisId);
  throwIfError(error, "Could not store parser coverage");
}

export async function runRepositoryPipeline(repositoryUrl: string): Promise<PipelineResult> {
  const { userId, orgId, sessionClaims } = await auth();
  if (!userId) throw new Error("Sign in before analysing a repository.");
  if (!orgId) throw new Error("Choose an organization before analysing a repository.");

  const repository = parseGitHubRepository(repositoryUrl);
  const supabase = createPipelineWriter();
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
  if (existing) return { analysisId: existing.id, status: "existing" };

  const { data: analysis, error: analysisError } = await supabase.from("analyses").insert({
    organization_id: orgId,
    project_id: project.id,
    status: "running",
    stage: "fetching",
    stage_message: "Fetching the public repository archive.",
    started_at: new Date().toISOString(),
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

  let stage: PipelineStage = "fetching";
  let fetched: Awaited<ReturnType<typeof fetchGitHubRepository>> | undefined;
  try {
    fetched = await fetchGitHubRepository(repository);
    stage = "selecting";
    await updateStage(supabase, analysis.id, stage, "Selecting supported TypeScript and JavaScript source files.");
    stage = "parsing";
    await updateStage(supabase, analysis.id, stage, "Parsing files and resolving imports.");
    const parsed = await parseRepository(fetched.directory);
    stage = "storing";
    await updateStage(supabase, analysis.id, stage, "Storing parsed files, dependencies, and coverage.");
    await storeParseResult(supabase, orgId, analysis.id, parsed);
    const { error: completeError } = await supabase.from("analyses").update({
      status: "completed",
      stage: "completed",
      stage_message: "Analysis complete.",
      commit_sha: fetched.commitSha,
      completed_at: new Date().toISOString(),
    }).eq("id", analysis.id);
    throwIfError(completeError, "Could not finish the analysis");
    return { analysisId: analysis.id, status: "completed", commitSha: fetched.commitSha };
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error interrupted the analysis.";
    await supabase.from("edges").delete().eq("analysis_id", analysis.id);
    await supabase.from("files").delete().eq("analysis_id", analysis.id);
    const { error: failedStateError } = await supabase.from("analyses").update({
      status: "failed",
      stage: "failed",
      stage_message: message,
      failed_stage: stage,
      error_message: message,
      ...(fetched ? { commit_sha: fetched.commitSha } : {}),
      completed_at: new Date().toISOString(),
    }).eq("id", analysis.id);
    throwIfError(failedStateError, `Analysis failed (${message}) and its failed state could not be stored`);
    throw error;
  } finally {
    await fetched?.cleanup();
  }
}
