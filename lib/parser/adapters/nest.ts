import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { genericEntryPoint } from "../adapter.ts";
import type { ExtractedRoute, ParserAdapter } from "../types.ts";

const routeMethods = new Map<string, string>([["Get", "GET"], ["Post", "POST"], ["Put", "PUT"], ["Patch", "PATCH"], ["Delete", "DELETE"], ["Options", "OPTIONS"], ["Head", "HEAD"]]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decorators(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
}

function decoratorName(decorator: ts.Decorator): string | null {
  const expression = decorator.expression;
  const name = ts.isCallExpression(expression) ? expression.expression : expression;
  return ts.isIdentifier(name) ? name.text : null;
}

function literalArgument(decorator: ts.Decorator): string | null | undefined {
  if (!ts.isCallExpression(decorator.expression)) return undefined;
  const first = decorator.expression.arguments[0];
  if (!first) return "";
  return ts.isStringLiteralLike(first) ? first.text : undefined;
}

function joinPath(prefix: string, suffix: string): string {
  const joined = [prefix, suffix].filter((part) => part !== "").join("/");
  if (joined === "") return "/";
  return joined.startsWith("/") ? joined : `/${joined}`;
}

function packageHasNest(root: string): boolean {
  const packagePath = resolve(root, "package.json");
  if (!existsSync(packagePath)) return false;
  try {
    const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
    if (!isRecord(parsed)) return false;
    for (const section of ["dependencies", "devDependencies"] as const) {
      if (!(section in parsed)) continue;
      const entries = parsed[section];
      if (typeof entries === "object" && entries !== null && "@nestjs/core" in entries) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export const nestAdapter: ParserAdapter = {
  name: "nestjs",
  framework: "nestjs",
  detect(root) {
    if (packageHasNest(root)) return true;
    return readdirSync(root).some((name) => /\.(?:controller|module)\.[cm]?[jt]s$/.test(name));
  },
  excludeDirectories: () => [],
  entryPoint(path) {
    return genericEntryPoint(path) ?? (/\.(?:controller|module)\.[cm]?[jt]s$/.test(path) ? "Declared by a NestJS class convention." : null);
  },
  role(path) {
    const name = path.split("/").at(-1) ?? path;
    if (/\.controller\.[cm]?[jt]s$/.test(name)) return "Controllers";
    if (/\.service\.[cm]?[jt]s$/.test(name)) return "Services";
    if (/\.module\.[cm]?[jt]s$/.test(name)) return "Modules";
    if (/\.(?:entity|schema)\.[cm]?[jt]s$/.test(name)) return "Entities";
    if (/\.guard\.[cm]?[jt]s$/.test(name)) return "Guards";
    if (/\.interceptor\.[cm]?[jt]s$/.test(name)) return "Interceptors";
    if (/\.middleware\.[cm]?[jt]s$/.test(name)) return "Middleware";
    return "Providers";
  },
  routes(files) {
    const routes: ExtractedRoute[] = [];
    for (const file of files) {
      for (const statement of file.source.statements) {
        if (!ts.isClassDeclaration(statement) || !statement.name) continue;
        const controllerDecorator = decorators(statement).find((decorator) => decoratorName(decorator) === "Controller");
        if (!controllerDecorator) continue;
        const prefix = literalArgument(controllerDecorator);
        if (prefix === undefined || prefix === null) continue;
        for (const member of statement.members) {
          if (!ts.isMethodDeclaration(member) || !member.name) continue;
          const endpoint = decorators(member).find((decorator) => {
            const name = decoratorName(decorator);
            return name !== null && routeMethods.has(name);
          });
          if (!endpoint) continue;
          const name = decoratorName(endpoint);
          const suffix = literalArgument(endpoint);
          if (!name || suffix === undefined || suffix === null) continue;
          const method = routeMethods.get(name);
          if (!method) continue;
          routes.push({ method, path: joinPath(prefix, suffix), file: file.path });
        }
      }
    }
    return routes.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method) || left.file.localeCompare(right.file));
  },
};
