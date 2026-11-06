import { RepositoryInputError } from "@/lib/pipeline/github";
import { runAnalysisPipeline } from "@/lib/pipeline/run";

export async function POST(_request: Request, context: RouteContext<"/api/analyses/[analysisId]/run">) {
  const { analysisId } = await context.params;
  try {
    const result = await runAnalysisPipeline(analysisId);
    return Response.json(result, { status: result.status === "existing" ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The repository could not be analysed.";
    const status = error instanceof RepositoryInputError
      ? 400
      : message.startsWith("Sign in") || message.startsWith("Choose an organization") ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
