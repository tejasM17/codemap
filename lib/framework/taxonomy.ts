import type { FrameworkId } from "@/lib/parser/types";

export interface RoleCategory {
  name: string;
  group: "surface" | "layer" | "plumbing";
}

const taxonomies: Record<FrameworkId, readonly RoleCategory[]> = {
  next: [
    { name: "Page routes", group: "surface" },
    { name: "API endpoints", group: "surface" },
    { name: "Server actions", group: "surface" },
    { name: "Components", group: "layer" },
    { name: "Utilities", group: "plumbing" },
  ],
  nestjs: [
    { name: "Controllers", group: "surface" },
    { name: "Services", group: "layer" },
    { name: "Modules", group: "layer" },
    { name: "Entities", group: "layer" },
    { name: "Guards", group: "plumbing" },
    { name: "Interceptors", group: "plumbing" },
    { name: "Middleware", group: "plumbing" },
    { name: "Providers", group: "plumbing" },
  ],
  react: [
    { name: "Components", group: "surface" },
    { name: "Hooks", group: "layer" },
    { name: "Utilities", group: "plumbing" },
  ],
  generic: [{ name: "Files", group: "plumbing" }],
};

export function rolesForFramework(framework: FrameworkId): readonly RoleCategory[] {
  return taxonomies[framework];
}

export function frameworkLabel(framework: FrameworkId): string {
  return { next: "Next.js", nestjs: "NestJS", react: "React", generic: "None detected" }[framework];
}
