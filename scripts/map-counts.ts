import { readFile } from "node:fs/promises";
import { foldModules } from "../lib/graph/fold.ts";
import { validateParseResult } from "../lib/parser/validate.ts";

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath || process.argv.length !== 3) {
    throw new Error("Usage: pnpm map-counts <analysis.json>");
  }

  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  if (!validateParseResult(parsed)) {
    throw new Error(`Invalid parser output contract: ${filePath}`);
  }

  const graph = foldModules(parsed);
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const singleFileNodes = graph.nodes.filter((node) => node.files.length < 2).length;
  const invalidEdges = graph.edges.filter((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to)).length;

  console.log(JSON.stringify({
    nodes: graph.nodes.length,
    singleFileNodes,
    invalidEdges,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
