export type EdgeKind = "import" | "re-export" | "dynamic-import";

export type ImportResolutionStatus = "internal" | "external" | "excluded" | "failed";

export interface ParsedFile {
  path: string;
  module: string;
  extension: string;
  lines: number;
  hash: string;
  fanIn: number;
  fanOut: number;
  entryPointReason: string | null;
}

export interface DependencyEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  specifier: string;
  isTypeOnly: boolean;
}

export interface ImportCoverage {
  from: string;
  specifier: string;
  kind: EdgeKind;
  status: ImportResolutionStatus;
  reason?: string;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface ParseResult {
  schemaVersion: 2;
  root: string;
  filesFound: number;
  filesParsed: number;
  filesSkipped: number;
  files: ParsedFile[];
  edges: DependencyEdge[];
  coverage: {
    importsFound: number;
    internal: number;
    external: number;
    excluded: number;
    failed: number;
    imports: ImportCoverage[];
  };
  skipped: SkippedFile[];
}

export interface ParserAdapter {
  name: string;
  detect(root: string): boolean;
  excludeDirectories(root: string): string[];
  entryPoint(path: string): string | null;
}
