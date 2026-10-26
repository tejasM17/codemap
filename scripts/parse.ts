import { readFile, writeFile } from "node:fs/promises";
import { parseRepository } from "../lib/parser/index.ts";
import { validateParseResult } from "../lib/parser/validate.ts";

function usage(): never {
  console.error("Usage: node scripts/parse.ts <repository-directory> [--out <file>] | --read <file>");
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--read") {
    const filePath = args[1];
    if (!filePath || args.length !== 2) usage();
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    if (!validateParseResult(parsed)) throw new Error(`Invalid parser output contract: ${filePath}`);
    console.log(JSON.stringify({ valid: true, filesFound: parsed.filesFound, filesParsed: parsed.filesParsed, filesSkipped: parsed.filesSkipped, folders: new Set(parsed.files.map((file) => file.module)).size, importsFound: parsed.coverage.importsFound, reExportsFound: parsed.coverage.imports.filter((item) => item.kind === "re-export").length, reExportsResolved: parsed.coverage.imports.filter((item) => item.kind === "re-export" && item.status === "internal").length, unresolved: parsed.coverage.imports.filter((item) => item.status === "failed") }, null, 2));
    return;
  }

  const directory = args[0];
  if (!directory) usage();
  let outputPath: string | undefined;
  if (args.length > 1) {
    if (args[1] !== "--out" || !args[2] || args.length !== 3) usage();
    outputPath = args[2];
  }
  const result = await parseRepository(directory);
  if (outputPath) await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ root: result.root, filesFound: result.filesFound, filesParsed: result.filesParsed, filesSkipped: result.filesSkipped, skipped: result.skipped, folders: new Set(result.files.map((file) => file.module)).size, edges: result.edges.length, importsFound: result.coverage.importsFound, coverage: { internal: result.coverage.internal, external: result.coverage.external, excluded: result.coverage.excluded, failed: result.coverage.failed, unresolved: result.coverage.imports.filter((item) => item.status === "failed") }, reExportsFound: result.coverage.imports.filter((item) => item.kind === "re-export").length, reExportsResolved: result.coverage.imports.filter((item) => item.kind === "re-export" && item.status === "internal").length, ...(outputPath ? { outputPath } : {}) }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
