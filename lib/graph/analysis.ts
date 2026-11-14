import type { DependencyEdge, ParsedFile } from "@/lib/parser/types";

export type WalkDirection = "outgoing" | "incoming";

/** Walk real file edges from the selected file, excluding the starting file. */
export function walkDependencyLevels(
  path: string,
  edges: DependencyEdge[],
  direction: WalkDirection,
): string[][] {
  const adjacent = new Map<string, Set<string>>();
  for (const edge of edges) {
    const from = direction === "outgoing" ? edge.from : edge.to;
    const to = direction === "outgoing" ? edge.to : edge.from;
    const neighbors = adjacent.get(from) ?? new Set<string>();
    neighbors.add(to);
    adjacent.set(from, neighbors);
  }
  const seen = new Set([path]);
  let frontier = [path];
  const levels: string[][] = [];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const neighbor of adjacent.get(current) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        next.push(neighbor);
      }
    }
    if (next.length > 0) levels.push(next);
    frontier = next;
  }
  return levels;
}

export type InsightKind = "unimported" | "high-fan-in" | "long-file" | "cycle";

export interface GraphInsight {
  kind: InsightKind;
  path: string;
  relatedPaths?: string[];
  sentence: string;
}

const LONG_FILE_LINES = 500;

function findCycles(paths: string[], adjacency: Map<string, Set<string>>): string[][] {
  const state = new Map<string, 0 | 1 | 2>();
  const cycles: string[][] = [];
  const cycleKeys = new Set<string>();
  for (const start of paths) {
    if (state.has(start)) continue;
    const stack: { path: string; neighbors: string[]; index: number }[] = [];
    const activeIndex = new Map<string, number>();
    state.set(start, 1);
    activeIndex.set(start, 0);
    stack.push({ path: start, neighbors: [...(adjacency.get(start) ?? [])], index: 0 });
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const next = frame.neighbors[frame.index];
      if (next === undefined) {
        state.set(frame.path, 2);
        activeIndex.delete(frame.path);
        stack.pop();
        continue;
      }
      frame.index += 1;
      const nextState = state.get(next) ?? 0;
      if (nextState === 0) {
        state.set(next, 1);
        activeIndex.set(next, stack.length);
        stack.push({ path: next, neighbors: [...(adjacency.get(next) ?? [])], index: 0 });
      } else if (nextState === 1) {
        const index = activeIndex.get(next);
        if (index === undefined) continue;
        const cycle = stack.slice(index).map((entry) => entry.path);
        const canonical = [...cycle].sort().join("\u0000");
        if (!cycleKeys.has(canonical)) {
          cycleKeys.add(canonical);
          cycles.push(cycle);
        }
      }
    }
  }
  return cycles;
}

export function findGraphInsights(files: ParsedFile[], edges: DependencyEdge[]): GraphInsight[] {
  const paths = files.map((file) => file.path);
  const filePaths = new Set(paths);
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const edge of edges) {
    const sources = incoming.get(edge.to) ?? new Set<string>();
    sources.add(edge.from);
    incoming.set(edge.to, sources);
    const targets = outgoing.get(edge.from) ?? new Set<string>();
    targets.add(edge.to);
    outgoing.set(edge.from, targets);
  }
  const unimported = files.filter((file) => !incoming.has(file.path) && file.entryPointReason === null);
  const counts = files.map((file) => incoming.get(file.path)?.size ?? 0);
  const mean = counts.length ? counts.reduce((sum, value) => sum + value, 0) / counts.length : 0;
  const variance = counts.length ? counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / counts.length : 0;
  const highFanInThreshold = Math.max(4, mean + 2 * Math.sqrt(variance));
  const insights: GraphInsight[] = [
    ...unimported.map((file) => ({ kind: "unimported" as const, path: file.path, sentence: "No other parsed file imports this file." })),
    ...files.filter((file) => (incoming.get(file.path)?.size ?? 0) >= highFanInThreshold).map((file) => ({ kind: "high-fan-in" as const, path: file.path, sentence: "Many parsed files import this file." })),
    ...files.filter((file) => file.lines > LONG_FILE_LINES).map((file) => ({ kind: "long-file" as const, path: file.path, sentence: "This file is over 500 lines long." })),
  ];
  for (const cycle of findCycles(paths, outgoing)) {
    if (cycle.some((path) => !filePaths.has(path))) continue;
    insights.push({ kind: "cycle", path: cycle[0], relatedPaths: cycle.slice(1), sentence: "This file is part of an import cycle." });
  }
  return insights;
}
