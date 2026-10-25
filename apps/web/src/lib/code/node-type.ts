import type { IconSvgElement } from "@hugeicons/react";
import {
  ApiIcon,
  CheckmarkSquare01Icon,
  CodeSquareIcon,
  Database01Icon,
  File01Icon,
  Folder01Icon,
  FunctionIcon,
  Layers01Icon,
  Share01Icon,
  SourceCodeIcon,
  WorkflowSquare01Icon,
} from "@hugeicons/core-free-icons";

import type { CodeNodeType, ERiskLevel } from "@/types/code/intelligence";

/** vis-network node shape per code-node type — deliberately NOT all circles. */
export type TNodeShape = "box" | "dot" | "database" | "diamond" | "square";

export interface INodeTypeMeta {
  label: string;
  icon: IconSvgElement;
  shape: TNodeShape;
  /** shadcn-token text class for the type glyph in chrome (chips/tree/inspector) */
  toneClass: string;
}

const META: Record<CodeNodeType, INodeTypeMeta> = {
  repository: { label: "Repository", icon: SourceCodeIcon, shape: "box", toneClass: "text-foreground" },
  module: { label: "Module", icon: Layers01Icon, shape: "box", toneClass: "text-primary" },
  folder: { label: "Folder", icon: Folder01Icon, shape: "box", toneClass: "text-muted-foreground" },
  file: { label: "File", icon: File01Icon, shape: "box", toneClass: "text-foreground" },
  class: { label: "Class", icon: CodeSquareIcon, shape: "diamond", toneClass: "text-foreground" },
  function: { label: "Function", icon: FunctionIcon, shape: "dot", toneClass: "text-muted-foreground" },
  api: { label: "API Endpoint", icon: ApiIcon, shape: "box", toneClass: "text-primary" },
  database: { label: "Database", icon: Database01Icon, shape: "database", toneClass: "text-foreground" },
  table: { label: "Table", icon: Database01Icon, shape: "database", toneClass: "text-foreground" },
  queue: { label: "Queue", icon: WorkflowSquare01Icon, shape: "box", toneClass: "text-muted-foreground" },
  test: { label: "Test", icon: CheckmarkSquare01Icon, shape: "square", toneClass: "text-muted-foreground" },
  external: { label: "External Service", icon: Share01Icon, shape: "box", toneClass: "text-muted-foreground" },
};

export function nodeTypeMeta(type: CodeNodeType): INodeTypeMeta {
  return META[type] ?? META.file;
}

/**
 * Map the live graph's free-string `kind` (File/Class/Function/Method/Interface)
 * plus a path heuristic onto a typed CodeNodeType. Path wins for tests/migrations
 * because the backend has no typed test/table nodes yet (GIA-15).
 */
export function kindToNodeType(kind?: string, path?: string): CodeNodeType {
  const p = (path ?? "").toLowerCase();
  if (/(^|\/)tests?\//.test(p) || /_test\.|\.test\.|\.spec\.|(^|\/)test_/.test(p)) return "test";
  if (/(^|\/)migrations?\//.test(p)) return "table";
  const k = (kind ?? "").toLowerCase();
  if (k === "class" || k === "interface") return "class";
  if (k === "function" || k === "method") return "function";
  if (k === "module") return "module";
  if (k === "file") return "file";
  return "file";
}

// ponytail: amber is the one intentional risk accent (the spec's "warn" tone);
// everything else stays on shadcn tokens.
export function riskToneClass(risk?: ERiskLevel): string {
  if (risk === "high") return "text-destructive";
  if (risk === "medium") return "text-amber-500";
  return "text-muted-foreground";
}

const GLYPH: Record<CodeNodeType, string> = {
  repository: "▦",
  module: "▤",
  folder: "▸",
  file: "▢",
  class: "◆",
  function: "●",
  api: "◇",
  database: "⛁",
  table: "⛁",
  queue: "▤",
  test: "▣",
  external: "◈",
};

export function nodeGlyph(type: CodeNodeType): string {
  return GLYPH[type] ?? "▢";
}

export function cardLabel(name: string, type: CodeNodeType, count?: number): string {
  const meta = nodeTypeMeta(type);
  const tail = count != null ? ` · ${count}` : "";
  return `${name}\n${nodeGlyph(type)} ${meta.label}${tail}`;
}
