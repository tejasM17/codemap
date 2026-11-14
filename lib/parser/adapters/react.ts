import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { genericEntryPoint } from "../adapter.ts";
import type { ParserAdapter } from "../types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasReactDependency(root: string): boolean {
  const packagePath = resolve(root, "package.json");
  if (!existsSync(packagePath)) return false;
  try {
    const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
    if (!isRecord(parsed)) return false;
    for (const section of ["dependencies", "devDependencies", "peerDependencies"] as const) {
      if (!(section in parsed)) continue;
      const entries = parsed[section];
      if (typeof entries === "object" && entries !== null && "react" in entries) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export const reactAdapter: ParserAdapter = {
  name: "react",
  framework: "react",
  detect: hasReactDependency,
  excludeDirectories: () => [],
  entryPoint: genericEntryPoint,
  role(path, source) {
    const name = path.split("/").at(-1) ?? path;
    if (/^use[A-Z0-9].*\.[cm]?[jt]sx?$/.test(name)) return "Hooks";
    let hasJsx = false;
    function visit(node: ts.Node): void {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) hasJsx = true;
      if (!hasJsx) ts.forEachChild(node, visit);
    }
    visit(source);
    return hasJsx ? "Components" : "Utilities";
  },
  routes: () => [],
};
