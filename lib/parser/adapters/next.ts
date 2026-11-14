import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { genericEntryPoint } from "../adapter.ts";
import type { ExtractedRoute, ParserAdapter } from "../types.ts";

const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasConventionFile(directory: string): boolean {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (hasConventionFile(path)) return true;
    } else if (entry.isFile()) {
      const normalized = path.replaceAll("\\", "/");
      if (/(?:^|\/)app\/(?:.*\/)?(?:page|route)\.[cm]?[jt]sx?$/.test(normalized)) return true;
      if (/(?:^|\/)pages\/(?!api\/)(?:.*\/)?[^/]+\.[cm]?[jt]sx?$/.test(normalized)) return true;
    }
  }
  return false;
}

function hasNextDependency(root: string): boolean {
  const packagePath = resolve(root, "package.json");
  if (!existsSync(packagePath)) return false;
  try {
    const packageJson: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
    if (!isRecord(packageJson)) return false;
    for (const section of ["dependencies", "devDependencies", "peerDependencies"] as const) {
      if (!(section in packageJson)) continue;
      const dependencies = packageJson[section];
      if (typeof dependencies === "object" && dependencies !== null && "next" in dependencies) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function appRoute(path: string): string | null {
  const parts = path.replace(/^src\//, "").split("/");
  if (parts[0] !== "app") return null;
  const file = parts.at(-1) ?? "";
  if (!/^page\.[cm]?[jt]sx?$/.test(file) && !/^route\.[cm]?[jt]sx?$/.test(file)) return null;
  const segments = parts.slice(1, -1);
  if (segments.some((segment) => /^\((?:\.{1,3})\)/.test(segment) || segment.startsWith("@") || segment.startsWith("_"))) return null;
  const routeSegments = segments.filter((segment) => !/^\(.*\)$/.test(segment));
  return `/${routeSegments.join("/")}`.replace(/\/$/, "") || "/";
}

function pagesRoute(path: string): string | null {
  const parts = path.replace(/^src\//, "").split("/");
  if (parts[0] !== "pages") return null;
  const filename = parts.at(-1) ?? "";
  if (!/\.[cm]?[jt]sx?$/.test(filename)) return null;
  if (["_app", "_document", "_error", "404", "500"].includes(filename.replace(/\.[cm]?[jt]sx?$/, ""))) return null;
  const segments = [...parts.slice(1, -1), filename.replace(/\.[cm]?[jt]sx?$/, "")];
  if (segments[0] === "api") return null;
  if (segments.at(-1) === "index") segments.pop();
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

function hasTopLevelDirective(source: ts.SourceFile, directive: string): boolean {
  return source.statements.some((statement) => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === directive);
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false);
}

function containsServerAction(source: ts.SourceFile): boolean {
  if (hasTopLevelDirective(source, "use server")) return true;
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    const asyncFunction = ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)
      ? ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ?? false
      : false;
    if (asyncFunction && (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body && ts.isBlock(node.body) && node.body.statements.some((statement) => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression) && statement.expression.text === "use server")) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

export const nextAdapter: ParserAdapter = {
  name: "nextjs",
  framework: "next",
  detect(root) {
    if (readdirSync(root).some((name) => /^next\.config\.[cm]?[jt]s$/.test(name))) return true;
    if (hasNextDependency(root)) return true;
    return hasConventionFile(root);
  },
  excludeDirectories: () => [],
  entryPoint(path) {
    return genericEntryPoint(path) ?? (appRoute(path) !== null || pagesRoute(path) !== null ? "Reached by the framework convention." : null);
  },
  role(path, source) {
    if (containsServerAction(source)) return "Server actions";
    if (/^(?:src\/)?pages\/api\/.+\.[cm]?[jt]sx?$/.test(path)) return "API endpoints";
    if (/^(?:src\/)?(?:app|pages)\//.test(path)) {
      const appPath = appRoute(path);
      if (appPath !== null && /(?:^|\/)route\.[cm]?[jt]sx?$/.test(path)) return "API endpoints";
      if (appPath !== null || pagesRoute(path) !== null) return "Page routes";
    }
    let hasJsx = false;
    function visit(node: ts.Node): void {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) hasJsx = true;
      if (!hasJsx) ts.forEachChild(node, visit);
    }
    visit(source);
    return hasJsx ? "Components" : "Utilities";
  },
  routes(files) {
    const routes: ExtractedRoute[] = [];
    for (const file of files) {
      const path = appRoute(file.path);
      if (path === null) {
        const legacyPath = pagesRoute(file.path);
        if (legacyPath !== null) routes.push({ method: "GET", path: legacyPath, file: file.path });
        continue;
      }
      if (!/(?:^|\/)route\.[cm]?[jt]sx?$/.test(file.path)) {
        routes.push({ method: "GET", path, file: file.path });
        continue;
      }
      for (const statement of file.source.statements) {
        if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name && methods.has(statement.name.text.toUpperCase())) {
          routes.push({ method: statement.name.text.toUpperCase(), path, file: file.path });
        } else if (ts.isVariableStatement(statement) && isExported(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || !methods.has(declaration.name.text.toUpperCase())) continue;
            if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
              routes.push({ method: declaration.name.text.toUpperCase(), path, file: file.path });
            }
          }
        }
      }
    }
    return routes.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method));
  },
};
