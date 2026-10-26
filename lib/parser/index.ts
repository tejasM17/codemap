import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { fallbackAdapter } from "./adapter.ts";
import type { DependencyEdge, EdgeKind, ImportCoverage, ParseResult, ParserAdapter, ParsedFile, SkippedFile } from "./types.ts";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const MAX_FILE_BYTES = 1_000_000;
const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];

interface ImportReference {
  specifier: string;
  kind: EdgeKind;
  isTypeOnly: boolean;
  line: number;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function lineCount(content: string): number {
  if (content.length === 0) return 0;
  return content.split(/\r\n|\n|\r/).length;
}

async function collectFiles(root: string, excluded: Set<string>): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const rel = toPosix(relative(root, absolute));
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".") || excluded.has(rel)) continue;
        await visit(absolute);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        result.push(absolute);
      }
    }
  }
  await visit(root);
  return result;
}

async function nearestCompilerOptions(filePath: string, root: string, cache: Map<string, ts.CompilerOptions>): Promise<ts.CompilerOptions> {
  let directory = dirname(filePath);
  while (inside(root, directory)) {
    const cached = cache.get(directory);
    if (cached) return cached;
    for (const configName of CONFIG_NAMES) {
      const configPath = resolve(directory, configName);
      try {
        const config = ts.readConfigFile(configPath, ts.sys.readFile);
        if (config.error) continue;
        const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory, undefined, configPath);
        const options: ts.CompilerOptions = {
          ...parsed.options,
          allowJs: true,
          allowImportingTsExtensions: true,
          moduleResolution: parsed.options.moduleResolution ?? ts.ModuleResolutionKind.Bundler,
        };
        cache.set(directory, options);
        return options;
      } catch {
        // Missing or unreadable config means the fallback resolver options.
      }
    }
    if (directory === root) break;
    const parent = dirname(directory);
    if (parent === directory || !inside(root, parent)) break;
    directory = parent;
  }
  const options: ts.CompilerOptions = { allowJs: true, allowImportingTsExtensions: true, moduleResolution: ts.ModuleResolutionKind.Bundler };
  cache.set(directory, options);
  return options;
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false;
  return clause.isTypeOnly || (!clause.name && clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((element) => element.isTypeOnly));
}

function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
  return node.isTypeOnly || (node.exportClause !== undefined && ts.isNamedExports(node.exportClause) && node.exportClause.elements.every((element) => element.isTypeOnly));
}

function readImports(source: ts.SourceFile): ImportReference[] {
  const found: ImportReference[] = [];
  function add(specifier: string, kind: EdgeKind, isTypeOnly: boolean, node: ts.Node): void {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push({ specifier, kind, isTypeOnly, line: line + 1 });
  }
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, "import", isTypeOnlyImport(node), node);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, "re-export", isTypeOnlyExport(node), node);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) add(argument.text, "dynamic-import", false, node);
      else add("<non-literal dynamic import>", "dynamic-import", false, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function resolveImport(reference: ImportReference, from: string, root: string, candidates: Map<string, string>, options: ts.CompilerOptions): { status: ImportCoverage["status"]; target?: string; reason?: string } {
  if (reference.specifier === "<non-literal dynamic import>") {
    return { status: "failed", reason: `dynamic import at line ${reference.line} does not use a literal string` };
  }
  const resolution = ts.resolveModuleName(reference.specifier, from, options, ts.sys).resolvedModule;
  if (!resolution) {
    if (reference.specifier.startsWith(".") || reference.specifier.startsWith("/")) {
      const unresolvedPath = resolve(dirname(from), reference.specifier);
      if (inside(root, unresolvedPath) && existsSync(unresolvedPath)) {
        return { status: "excluded", reason: `resolved to ${toPosix(relative(root, unresolvedPath))}, which is not a selected source node` };
      }
    }
    if (!reference.specifier.startsWith(".") && !reference.specifier.startsWith("/") && !reference.specifier.startsWith("#")) {
      return { status: "external", reason: "package or Node built-in import" };
    }
    return { status: "failed", reason: `TypeScript could not resolve the path from line ${reference.line}` };
  }
  const resolved = resolve(resolution.resolvedFileName);
  if (!inside(root, resolved)) return { status: "external", reason: "resolved outside the repository" };
  const repoPath = toPosix(relative(root, resolved));
  if (repoPath.split("/").includes("node_modules")) {
    return { status: "external", reason: "resolved to a dependency under node_modules" };
  }
  if (!candidates.has(resolved)) {
    return { status: "excluded", reason: `resolved to ${repoPath}, which is not a selected source node` };
  }
  return { status: "internal", target: repoPath };
}

export async function parseRepository(directory: string, adapter: ParserAdapter = fallbackAdapter): Promise<ParseResult> {
  const root = resolve(directory);
  const excluded = new Set(adapter.excludeDirectories(root).map((path) => toPosix(path)));
  const discovered = await collectFiles(root, excluded);
  const skipped: SkippedFile[] = [];
  const parsedFiles: ParsedFile[] = [];
  const candidates = new Map<string, string>();
  const contentByFile = new Map<string, string>();

  for (const absolutePath of discovered) {
    const path = toPosix(relative(root, absolutePath));
    const extension = extname(absolutePath).toLowerCase();
    if (path.endsWith(".d.ts") || path.endsWith(".d.mts") || path.endsWith(".d.cts")) {
      skipped.push({ path, reason: "declaration file" });
      continue;
    }
    let contentBuffer: Buffer;
    try {
      contentBuffer = await readFile(absolutePath);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown read error";
      skipped.push({ path, reason: `could not read file: ${reason}` });
      continue;
    }
    if (contentBuffer.byteLength > MAX_FILE_BYTES) {
      skipped.push({ path, reason: `file exceeds the ${MAX_FILE_BYTES} byte parsing limit` });
      continue;
    }
    const content = contentBuffer.toString("utf8");
    const scriptKind = extension === ".tsx" || extension === ".jsx" ? ts.ScriptKind.TSX : extension === ".js" || extension === ".mjs" || extension === ".cjs" ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const source = ts.createSourceFile(absolutePath, content, ts.ScriptTarget.Latest, true, scriptKind);
    const diagnostics = ts.transpileModule(content, {
      fileName: absolutePath,
      reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.Preserve },
    }).diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
    if (diagnostics.length > 0) {
      const start = diagnostics[0].start;
      skipped.push({ path, reason: `TypeScript parser error at line ${(start === undefined ? 0 : source.getLineAndCharacterOfPosition(start).line) + 1}` });
      continue;
    }
    candidates.set(resolve(absolutePath), path);
    contentByFile.set(absolutePath, content);
    parsedFiles.push({
      path,
      module: toPosix(dirname(relative(root, absolutePath))) === "." ? "." : toPosix(dirname(relative(root, absolutePath))),
      extension,
      lines: lineCount(content),
      hash: createHash("sha256").update(content).digest("hex"),
      fanIn: 0,
      fanOut: 0,
    });
  }

  const filesByAbsolute = new Map(parsedFiles.map((file) => [resolve(root, file.path), file]));
  const compilerOptionsCache = new Map<string, ts.CompilerOptions>();
  const coverageImports: ImportCoverage[] = [];
  const edgeMap = new Map<string, DependencyEdge>();

  for (const file of parsedFiles) {
    const absolutePath = resolve(root, file.path);
    const source = ts.createSourceFile(absolutePath, contentByFile.get(absolutePath) ?? "", ts.ScriptTarget.Latest, true);
    const options = await nearestCompilerOptions(absolutePath, root, compilerOptionsCache);
    for (const reference of readImports(source)) {
      const resolution = resolveImport(reference, absolutePath, root, candidates, options);
      coverageImports.push({ from: file.path, specifier: reference.specifier, kind: reference.kind, status: resolution.status, ...(resolution.reason ? { reason: resolution.reason } : {}) });
      if (resolution.status !== "internal" || !resolution.target) continue;
      const key = `${file.path}\0${resolution.target}\0${reference.kind}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { from: file.path, to: resolution.target, kind: reference.kind, specifier: reference.specifier, isTypeOnly: reference.isTypeOnly });
    }
  }

  const edges = [...edgeMap.values()];
  for (const edge of edges) {
    const sourceFile = filesByAbsolute.get(resolve(root, edge.from));
    const targetFile = filesByAbsolute.get(resolve(root, edge.to));
    if (sourceFile) sourceFile.fanOut += 1;
    if (targetFile) targetFile.fanIn += 1;
  }
  const counts = { internal: 0, external: 0, excluded: 0, failed: 0 };
  for (const entry of coverageImports) counts[entry.status] += 1;

  return {
    schemaVersion: 1,
    root,
    filesFound: discovered.length,
    filesParsed: parsedFiles.length,
    filesSkipped: skipped.length,
    files: parsedFiles,
    edges,
    coverage: { importsFound: coverageImports.length, ...counts, imports: coverageImports },
    skipped,
  };
}
