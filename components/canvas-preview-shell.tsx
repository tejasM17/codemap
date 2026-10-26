"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeControl } from "@/components/theme-control";
import { foldModules, type ModuleNode } from "@/lib/graph/fold";
import { GRAPH_MAX_VISIBLE_FILES, layoutGraph } from "@/lib/graph/layout";
import type { DependencyEdge, ParseResult, ParsedFile } from "@/lib/parser/types";

const extensionOrder = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

type Selection = { kind: "module"; id: string } | { kind: "file"; path: string };
type EdgeTone = "incoming" | "outgoing" | "quiet";

interface ModuleNodeData extends Record<string, unknown> {
  module: ModuleNode;
  isOpen: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  selectedFile: string | null;
  selectedModule: string | null;
  relatedFiles: string[];
  fileLabels: Record<string, string>;
  onOpen: (id: string) => void;
  onClose: () => void;
  onSelectFile: (path: string) => void;
}

interface DependencyEdgeData extends Record<string, unknown> {
  file: DependencyEdge;
  tone: EdgeTone;
}

type CanvasNode = FlowNode<ModuleNodeData, "module">;
type CanvasEdge = FlowEdge<DependencyEdgeData>;

function shortFileLabels(files: ParsedFile[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const file of files) {
    const parts = file.path.split("/");
    let label = parts.at(-1) ?? file.path;
    for (let size = 2; size <= parts.length; size += 1) {
      const suffix = parts.slice(-size).join("/");
      const matches = files.filter((candidate) => candidate.path.split("/").slice(-size).join("/") === suffix);
      if (matches.length === 1) {
        label = suffix;
        break;
      }
      label = suffix;
    }
    labels[file.path] = label;
  }
  return labels;
}

function fileEdgeTone(edge: DependencyEdge, selection: Selection | null, filesByModule: Map<string, Set<string>>): EdgeTone {
  if (!selection) return "quiet";
  if (selection.kind === "file") {
    if (edge.to === selection.path) return "incoming";
    if (edge.from === selection.path) return "outgoing";
    return "quiet";
  }
  const selectedFiles = filesByModule.get(selection.id);
  if (selectedFiles?.has(edge.to)) return "incoming";
  if (selectedFiles?.has(edge.from)) return "outgoing";
  return "quiet";
}

function fileHandleId(direction: "source" | "target", path: string): string {
  return `${direction}:${path}`;
}

function ModuleNodeView({ data }: NodeProps<CanvasNode>) {
  const { module, isOpen, isSelected, isDimmed, selectedFile, selectedModule, relatedFiles, fileLabels } = data;
  const visibleFiles = module.files.slice(0, GRAPH_MAX_VISIBLE_FILES);

  return (
    <section className={`canvas-module${isOpen ? " is-open" : ""}${isSelected ? " is-selected" : ""}${isDimmed ? " is-dimmed" : ""}`} aria-label={`${module.label}, ${module.files.length} files`}>
      <Handle id="module-target" type="target" position={Position.Left} className="canvas-handle canvas-handle--module" />
      <Handle id="module-source" type="source" position={Position.Right} className="canvas-handle canvas-handle--module" />
      {!isOpen ? (
        <button className="canvas-module__folded nodrag nopan" type="button" onClick={(event) => { event.stopPropagation(); data.onOpen(module.id); }} aria-expanded="false">
          <span className="canvas-module__name">{module.label}</span>
          <span className="canvas-module__summary">{module.files.length} files · in {module.fanIn} · out {module.fanOut}</span>
        </button>
      ) : (
        <>
          <button className="canvas-module__header nodrag nopan" type="button" onClick={(event) => { event.stopPropagation(); data.onClose(); }} aria-expanded="true">
            <span className="canvas-module__name">{module.label}</span>
            <span className="canvas-module__summary">{module.files.length} files · in {module.fanIn} · out {module.fanOut}</span>
          </button>
          <ul className="canvas-module__files" aria-label={`${module.label} files`}>
            {visibleFiles.map((file) => {
              const isFileSelected = selectedFile === file.path;
              const isFileRelated = !selectedFile && !selectedModule || isFileSelected || selectedModule === module.id || relatedFiles.includes(file.path);
              return (
                <li className="canvas-module__file-row" key={file.path}>
                  <Handle id={fileHandleId("target", file.path)} type="target" position={Position.Left} className="canvas-handle canvas-handle--row" />
                  <Handle id={fileHandleId("source", file.path)} type="source" position={Position.Right} className="canvas-handle canvas-handle--row" />
                  <button
                    type="button"
                    className={`canvas-module__file nodrag nopan${isFileSelected ? " is-selected" : ""}${isFileRelated ? "" : " is-dimmed"}`}
                    onClick={(event) => { event.stopPropagation(); data.onSelectFile(file.path); }}
                    title={file.path}
                  >
                    <span className="canvas-file-dot" aria-hidden="true" />
                    <span className="canvas-file-name">{fileLabels[file.path] ?? file.path}</span>
                    <span className="canvas-file-count">{file.fanIn}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {module.files.length > GRAPH_MAX_VISIBLE_FILES ? (
            <div className="canvas-module__overflow">+ {module.files.length - GRAPH_MAX_VISIBLE_FILES} more files</div>
          ) : null}
        </>
      )}
    </section>
  );
}

const nodeTypes = { module: ModuleNodeView };

function GraphCanvas({ analysis }: { analysis: ParseResult }) {
  const graph = useMemo(() => foldModules(analysis), [analysis]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const flow = useReactFlow<CanvasNode, CanvasEdge>();
  const nodesInitialized = useNodesInitialized();
  const lastFittedOpenId = useRef<string | null>(null);

  const layout = useMemo(() => layoutGraph(graph.nodes, graph.edges, openId), [graph.edges, graph.nodes, openId]);
  const filesByModule = useMemo(() => new Map(graph.nodes.map((node) => [node.id, new Set(node.files.map((file) => file.path))])), [graph.nodes]);
  const selectionContext = useMemo(() => {
    const selectedFiles = selection?.kind === "file"
      ? new Set([selection.path])
      : selection?.kind === "module"
        ? filesByModule.get(selection.id) ?? new Set<string>()
        : null;
    const relatedFiles = new Set<string>();
    const activeNodes = new Set<string>();
    const activeEdges = selection
      ? graph.edges.flatMap((edge) => edge.files.filter((file) => selectedFiles?.has(file.from) || selectedFiles?.has(file.to)))
      : [];
    if (selection?.kind === "module") activeNodes.add(selection.id);
    if (selection?.kind === "file") {
      for (const node of graph.nodes) if (node.files.some((file) => file.path === selection.path)) activeNodes.add(node.id);
    }
    for (const edge of activeEdges) {
      relatedFiles.add(edge.from);
      relatedFiles.add(edge.to);
      const fromNode = graph.nodes.find((node) => node.files.some((file) => file.path === edge.from));
      const toNode = graph.nodes.find((node) => node.files.some((file) => file.path === edge.to));
      if (fromNode) activeNodes.add(fromNode.id);
      if (toNode) activeNodes.add(toNode.id);
    }
    return { activeEdges, activeNodes, relatedFiles };
  }, [filesByModule, graph.edges, graph.nodes, selection]);
  const { activeNodes, relatedFiles } = selectionContext;

  const fileLabels = useMemo(() => shortFileLabels(openId ? graph.nodes.find((node) => node.id === openId)?.files ?? [] : []), [graph.nodes, openId]);
  const nodes = useMemo<CanvasNode[]>(() => layout.nodes.map((positioned) => {
    const isOpen = positioned.id === openId;
    const isDimmed = selection !== null && !activeNodes.has(positioned.id);
    return {
      id: positioned.id,
      type: "module",
      position: { x: positioned.x, y: positioned.y },
      width: positioned.width,
      height: positioned.height,
      style: { width: positioned.width, height: positioned.height },
      data: {
        module: positioned,
        isOpen,
        isSelected: selection?.kind === "module" && selection.id === positioned.id,
        isDimmed,
        selectedFile: selection?.kind === "file" ? selection.path : null,
        selectedModule: selection?.kind === "module" ? selection.id : null,
        relatedFiles: [...relatedFiles],
        fileLabels,
        onOpen: (id) => {
          setOpenId(id);
          setSelection({ kind: "module", id });
        },
        onClose: () => setOpenId(null),
        onSelectFile: (path) => setSelection({ kind: "file", path }),
      },
      draggable: false,
      selectable: false,
      focusable: true,
    };
  }), [activeNodes, fileLabels, layout.nodes, openId, relatedFiles, selection]);

  const edges = useMemo<CanvasEdge[]>(() => graph.edges.flatMap((moduleEdge) => moduleEdge.files.flatMap((file) => {
    if (moduleEdge.from === moduleEdge.to) return [];
    const tone = fileEdgeTone(file, selection, filesByModule);
    const dimmed = selection !== null && tone === "quiet";
    const sourceNode = layout.nodes.find((node) => node.id === moduleEdge.from);
    const targetNode = layout.nodes.find((node) => node.id === moduleEdge.to);
    if (!sourceNode || !targetNode) return [];
    const visibleSource = sourceNode.id === openId && sourceNode.files.findIndex((item) => item.path === file.from) < sourceNode.visibleFiles;
    const visibleTarget = targetNode.id === openId && targetNode.files.findIndex((item) => item.path === file.to) < targetNode.visibleFiles;
    return [{
      id: `${file.kind}:${file.from}:${file.to}`,
      source: moduleEdge.from,
      target: moduleEdge.to,
      sourceHandle: visibleSource ? fileHandleId("source", file.from) : "module-source",
      targetHandle: visibleTarget ? fileHandleId("target", file.to) : "module-target",
      type: "default",
      data: { file, tone },
      className: `canvas-flow-edge canvas-flow-edge--${tone}${dimmed ? " is-dimmed" : ""}`,
      style: {
        stroke: tone === "incoming" ? "var(--green)" : tone === "outgoing" ? "var(--amber)" : "var(--line-strong)",
        strokeWidth: tone === "quiet" ? 1 : 1.7,
        opacity: dimmed ? 0.08 : tone === "quiet" ? 0.48 : 0.95,
      },
      selectable: false,
      focusable: false,
    }];
  })), [filesByModule, graph.edges, layout.nodes, openId, selection]);

  const onNodeClick: NodeMouseHandler<CanvasNode> = (_event, node) => {
    if (!node.data.isOpen) {
      setOpenId(node.id);
      setSelection({ kind: "module", id: node.id });
    }
  };

  useEffect(() => {
    if (!openId) {
      lastFittedOpenId.current = null;
      return;
    }
    if (!nodesInitialized || lastFittedOpenId.current === openId) return;

    lastFittedOpenId.current = openId;
    const maxZoom = flow.getZoom();
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.18, minZoom: 0.15, maxZoom, duration: 180 });
    });
    return () => cancelAnimationFrame(frame);
  }, [flow, nodesInitialized, openId]);

  const extensionCounts = new Map<string, number>();
  for (const file of analysis.files) extensionCounts.set(file.extension, (extensionCounts.get(file.extension) ?? 0) + 1);
  const extensions = [...extensionCounts.keys()].sort((left, right) => {
    const leftIndex = extensionOrder.indexOf(left);
    const rightIndex = extensionOrder.indexOf(right);
    return (leftIndex < 0 ? extensionOrder.length : leftIndex) - (rightIndex < 0 ? extensionOrder.length : rightIndex) || left.localeCompare(right);
  });
  const repositoryImports = analysis.coverage.internal + analysis.coverage.failed;
  const resolvedRatio = repositoryImports > 0 ? Math.floor((analysis.coverage.internal / repositoryImports) * 100) : 100;
  const unresolvedImports = analysis.coverage.imports.filter((item) => item.status === "failed");
  const isGraphPartial = unresolvedImports.length > 0 || analysis.coverage.excluded > 0;

  return (
    <>
      <aside className="canvas-rail" aria-label="File categories by extension">
        <h1>Files by extension</h1>
        <ul>
          {extensions.map((extension, index) => (
            <li key={extension}>
              <span className={`canvas-role-swatch canvas-role-swatch--tone-${index % 5}`} aria-hidden="true" />
              <span>{extension}</span>
              <span className="canvas-extension-count">{extensionCounts.get(extension)}</span>
            </li>
          ))}
        </ul>
      </aside>
      <main className="canvas-stage" aria-label="Repository dependency graph">
        <div className="canvas-coverage" role="status">
          <strong>{isGraphPartial ? "Graph is partial" : "Graph complete"}</strong>
          <span>{analysis.coverage.internal} of {repositoryImports} imports into this repository resolved ({resolvedRatio}%)</span>
          {analysis.coverage.excluded > 0 ? <span>{analysis.coverage.excluded} imports target non-source files</span> : null}
          {unresolvedImports.map((item) => (
            <code key={`${item.from}:${item.specifier}`}>{item.from} · {item.specifier} · {item.reason}</code>
          ))}
        </div>
        <ReactFlow<CanvasNode, CanvasEdge>
          className="canvas-flow"
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18, minZoom: 0.15, maxZoom: 0.9 }}
          minZoom={0.15}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          zoomOnDoubleClick={false}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelection(null)}
        />
      </main>
      <aside className="canvas-details" aria-label="Selected file details" />
    </>
  );
}

function GraphView({ analysis }: { analysis: ParseResult }) {
  return (
    <ReactFlowProvider>
      <GraphCanvas analysis={analysis} />
    </ReactFlowProvider>
  );
}

export function CanvasPreviewShell({ analysis }: { analysis: ParseResult }) {
  return (
    <div className="canvas-preview">
      <header className="canvas-topbar">
        <Link className="canvas-brand" href="/preview" aria-label="Cartograph preview">
          <span>cartograph</span>
          <span className="canvas-topbar__slash" aria-hidden="true">/</span>
          <BrandMark />
        </Link>
        <OrganizationSwitcher
          afterSelectOrganizationUrl="/preview"
          afterCreateOrganizationUrl="/preview"
          hidePersonal
          appearance={{ elements: { rootBox: "canvas-org-switcher", organizationSwitcherTrigger: "canvas-org-trigger" } }}
        />
        <div className="canvas-topbar__right">
          <ThemeControl />
          <UserButton />
        </div>
      </header>
      <div className="canvas-columns">
        <GraphView analysis={analysis} />
      </div>
    </div>
  );
}
