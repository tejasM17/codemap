import type { ParseResult } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateParseResult(value: unknown): value is ParseResult {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (
    typeof value.root !== "string" ||
    typeof value.filesFound !== "number" ||
    typeof value.filesParsed !== "number" ||
    typeof value.filesSkipped !== "number" ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.edges) ||
    !Array.isArray(value.skipped) ||
    !isRecord(value.coverage)
  ) return false;

  const coverage = value.coverage;
  if (
    typeof coverage.importsFound !== "number" ||
    typeof coverage.internal !== "number" ||
    typeof coverage.external !== "number" ||
    typeof coverage.excluded !== "number" ||
    typeof coverage.failed !== "number" ||
    !Array.isArray(coverage.imports)
  ) return false;

  return value.files.every((file) =>
    isRecord(file) &&
    typeof file.path === "string" &&
    typeof file.module === "string" &&
    typeof file.extension === "string" &&
    typeof file.lines === "number" &&
    typeof file.hash === "string" &&
    typeof file.fanIn === "number" &&
    typeof file.fanOut === "number"
  ) && value.edges.every((edge) =>
    isRecord(edge) &&
    typeof edge.from === "string" &&
    typeof edge.to === "string" &&
    ["import", "re-export", "dynamic-import"].includes(String(edge.kind)) &&
    typeof edge.specifier === "string" &&
    typeof edge.isTypeOnly === "boolean"
  ) && value.skipped.every((entry) =>
    isRecord(entry) && typeof entry.path === "string" && typeof entry.reason === "string"
  ) && coverage.imports.every((entry) =>
    isRecord(entry) &&
    typeof entry.from === "string" &&
    typeof entry.specifier === "string" &&
    ["import", "re-export", "dynamic-import"].includes(String(entry.kind)) &&
    ["internal", "external", "excluded", "failed"].includes(String(entry.status)) &&
    (entry.reason === undefined || typeof entry.reason === "string")
  );
}
