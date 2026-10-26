import dagre from "@dagrejs/dagre";
import type { ModuleEdge, ModuleNode } from "@/lib/graph/fold";

export interface PositionedNode extends ModuleNode {
  x: number;
  y: number;
  width: number;
  height: number;
  visibleFiles: number;
}

export interface GraphLayout {
  nodes: PositionedNode[];
  width: number;
  height: number;
}

const MAX_VISIBLE_FILES = 14;
const HEADER_HEIGHT = 62;
const ROW_HEIGHT = 22;

function dimensions(node: ModuleNode, openId: string | null): Pick<PositionedNode, "width" | "height" | "visibleFiles"> {
  const width = Math.min(260, Math.max(132, node.label.length * 8 + 34));
  const visibleFiles = node.id === openId ? Math.min(node.files.length, MAX_VISIBLE_FILES) : 0;
  const overflowHeight = node.id === openId && node.files.length > MAX_VISIBLE_FILES ? 28 : 8;
  const height = node.id === openId
    ? HEADER_HEIGHT + visibleFiles * ROW_HEIGHT + overflowHeight
    : 42 + Math.sqrt(node.fanIn) * 12;
  return { width, height, visibleFiles };
}

export function layoutGraph(nodes: ModuleNode[], edges: ModuleEdge[], openId: string | null): GraphLayout {
  if (nodes.length === 0) return { nodes: [], width: 0, height: 0 };

  const graph = new dagre.graphlib.Graph<
    { rankdir: string; nodesep: number; ranksep: number; edgesep: number; marginx: number; marginy: number; align: string; width?: number; height?: number },
    { x?: number; y?: number; width: number; height: number },
    { weight: number }
  >();
  graph.setDefaultEdgeLabel(() => ({ weight: 1 }));
  graph.setGraph({
    rankdir: "LR",
    align: "UL",
    nodesep: 76,
    ranksep: 130,
    edgesep: 28,
    marginx: 80,
    marginy: 80,
  });

  const dimensionsById = new Map<string, ReturnType<typeof dimensions>>();
  for (const node of [...nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    const size = dimensions(node, openId);
    dimensionsById.set(node.id, size);
    graph.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of [...edges].filter((item) => item.from !== item.to).sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to))) {
    graph.setEdge(edge.from, edge.to, { weight: Math.max(1, edge.files.length) });
  }

  dagre.layout(graph);
  const positioned: PositionedNode[] = nodes.map((node) => {
    const calculated = graph.node(node.id);
    const size = dimensionsById.get(node.id);
    if (!calculated || !size || calculated.x === undefined || calculated.y === undefined) {
      throw new Error(`Dagre did not return a position for ${node.id}.`);
    }
    return {
      ...node,
      ...size,
      x: calculated.x - size.width / 2,
      y: calculated.y - size.height / 2,
    };
  });

  const bounds = graph.graph();
  return { nodes: positioned, width: bounds.width ?? 0, height: bounds.height ?? 0 };
}

export const GRAPH_PANEL_HEADER_HEIGHT = HEADER_HEIGHT;
export const GRAPH_ROW_HEIGHT = ROW_HEIGHT;
export const GRAPH_MAX_VISIBLE_FILES = MAX_VISIBLE_FILES;
