import type { DependencyEdge, ParseResult, ParsedFile } from "@/lib/parser/types";

export interface ModuleNode {
  id: string;
  label: string;
  files: ParsedFile[];
  fanIn: number;
  fanOut: number;
}

export interface ModuleEdge {
  id: string;
  from: string;
  to: string;
  files: DependencyEdge[];
}

export interface FoldedGraph {
  nodes: ModuleNode[];
  edges: ModuleEdge[];
  threshold: number;
  fileCount: number;
}

function parentPath(path: string): string | null {
  if (path === ".") return null;
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "." : path.slice(0, separator);
}

function depth(path: string): number {
  return path === "." ? 0 : path.split("/").length;
}

function ancestors(path: string): string[] {
  const result = [path];
  let current = path;
  while (current !== ".") {
    current = parentPath(current) ?? ".";
    result.push(current);
  }
  return result;
}

function shortestUniqueLabels(paths: string[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const path of paths) {
    const parts = path === "." ? ["root"] : path.split("/");
    let label = parts.at(-1) ?? path;
    for (let size = 2; size <= parts.length; size += 1) {
      const suffix = parts.slice(-size).join("/");
      if (paths.filter((candidate) => {
        const candidateParts = candidate === "." ? ["root"] : candidate.split("/");
        return candidateParts.slice(-size).join("/") === suffix;
      }).length === 1) {
        label = suffix;
        break;
      }
      label = suffix;
    }
    labels.set(path, label);
  }
  return labels;
}

function foldAtThreshold(files: ParsedFile[], directories: Set<string>, threshold: number): Map<string, ParsedFile[]> {
  const active = new Set(directories);
  const filesByDirectory = new Map<string, ParsedFile[]>();
  for (const directory of directories) filesByDirectory.set(directory, []);
  for (const file of files) filesByDirectory.get(file.module)?.push(file);
  const maxDepth = Math.max(...[...directories].map(depth));

  for (let currentDepth = maxDepth; currentDepth > 0; currentDepth -= 1) {
    const pass = [...active].filter((directory) => depth(directory) === currentDepth);
    const merge = pass.filter((directory) => (filesByDirectory.get(directory)?.length ?? 0) < threshold);
    const filesToMerge = merge.map((directory) => [directory, filesByDirectory.get(directory) ?? []] as const);
    for (const [directory] of filesToMerge) active.delete(directory);
    for (const [directory, members] of filesToMerge) {
      let parent = parentPath(directory) ?? ".";
      while (!active.has(parent) && parent !== ".") parent = parentPath(parent) ?? ".";
      const parentFiles = filesByDirectory.get(parent) ?? [];
      parentFiles.push(...members);
      filesByDirectory.set(parent, parentFiles);
      filesByDirectory.delete(directory);
    }
  }

  const groups = new Map<string, ParsedFile[]>();
  for (const directory of active) {
    const members = filesByDirectory.get(directory) ?? [];
    if (members.length > 0) groups.set(directory, members);
  }
  return groups;
}

export function foldModules(result: ParseResult): FoldedGraph {
  const directories = new Set<string>(["."]);
  for (const file of result.files) {
    for (const directory of ancestors(file.module)) directories.add(directory);
  }

  let threshold = 2;
  let groups = foldAtThreshold(result.files, directories, threshold);
  const maxThreshold = result.files.length + 1;
  while (threshold < maxThreshold && groups.size > 24) {
    threshold += 1;
    groups = foldAtThreshold(result.files, directories, threshold);
  }

  const paths = [...groups.keys()].sort((left, right) => left.localeCompare(right));
  const labels = shortestUniqueLabels(paths);
  const ownerByFile = new Map<string, string>();
  for (const [module, files] of groups) {
    for (const file of files) ownerByFile.set(file.path, module);
  }

  const edgeFiles = new Map<string, DependencyEdge[]>();
  for (const edge of result.edges) {
    const from = ownerByFile.get(edge.from);
    const to = ownerByFile.get(edge.to);
    if (!from || !to) continue;
    const id = `${from}\u0000${to}`;
    const members = edgeFiles.get(id) ?? [];
    members.push(edge);
    edgeFiles.set(id, members);
  }

  const nodes: ModuleNode[] = paths.map((id) => ({
    id,
    label: labels.get(id) ?? id,
    files: (groups.get(id) ?? []).sort((left, right) => left.path.localeCompare(right.path)),
    fanIn: (groups.get(id) ?? []).reduce((total, file) => total + file.fanIn, 0),
    fanOut: (groups.get(id) ?? []).reduce((total, file) => total + file.fanOut, 0),
  }));
  const edges: ModuleEdge[] = [...edgeFiles].map(([id, files]) => {
    const [from, to] = id.split("\u0000");
    return { id, from, to, files };
  });

  return { nodes, edges, threshold, fileCount: result.files.length };
}
