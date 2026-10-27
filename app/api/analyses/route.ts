import { RepositoryInputError } from "@/lib/pipeline/github";
import { runRepositoryPipeline } from "@/lib/pipeline/run";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("repositoryUrl" in body) || typeof body.repositoryUrl !== "string") {
    return Response.json({ error: "Provide a repositoryUrl." }, { status: 400 });
  }

  try {
    const result = await runRepositoryPipeline(body.repositoryUrl);
    return Response.json(result, { status: result.status === "existing" ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The repository could not be analysed.";
    const status = error instanceof RepositoryInputError
      ? 400
      : message.startsWith("Sign in") || message.startsWith("Choose an organization") ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
