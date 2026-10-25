"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";
import { FLOW_NODE_KINDS, type IFlowArtifact, type IFlowNode } from "@/lib/code/flow-artifact";
import { KIND_HUE, KIND_LABEL } from "./flow-diagram-style";

// vis-network is heavy and browser-only: load the canvas client-side on demand so
// it never enters the SSR bundle or loads for a plain reply. The loading state
// doubles as the "Building flow…" placeholder while the artifact/dep resolve.
const FlowDiagramCanvas = dynamic(() => import("./flow-diagram-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center text-xs text-muted-foreground">
      Building flow…
    </div>
  ),
});

/**
 * Interactive flow diagram for a validated Code Intelligence flow artifact
 * (GIN-314). Owns the chrome — title, controls, legend, node detail, source and
 * an accessible text equivalent — around the client-only vis-network canvas.
 */
export function FlowDiagram({ flow, source }: { flow: IFlowArtifact; source: string }) {
  const [selected, setSelected] = useState<IFlowNode | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [showText, setShowText] = useState(false);
  const [fitToken, setFitToken] = useState(0);

  // Plain computation — the React Compiler memoizes; no hand-rolled useMemo.
  const usedKinds = FLOW_NODE_KINDS.filter((k) => flow.nodes.some((n) => n.kind === k));

  return (
    <figure className="my-2 overflow-hidden rounded-lg border border-border bg-card">
      <figcaption className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate text-sm font-medium text-foreground">{flow.title}</span>
        <div className="flex shrink-0 items-center gap-1">
          <MiniButton onClick={() => setFitToken((t) => t + 1)}>Fit</MiniButton>
          <MiniButton active={showText} onClick={() => setShowText((v) => !v)}>Text</MiniButton>
          <MiniButton active={showSource} onClick={() => setShowSource((v) => !v)}>Source</MiniButton>
        </div>
      </figcaption>

      <FlowDiagramCanvas flow={flow} onSelect={setSelected} fitToken={fitToken} />

      {usedKinds.length > 1 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border px-3 py-2">
          {usedKinds.map((k) => (
            <li key={k} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: KIND_HUE[k] }} aria-hidden />
              {KIND_LABEL[k]}
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div className="border-t border-border px-3 py-2.5">
          <p className="text-xs font-semibold text-foreground">{selected.label}</p>
          {selected.summary ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{selected.summary}</p>
          ) : null}
          {selected.fileRefs?.length ? (
            <ul className="mt-1.5 space-y-0.5">
              {selected.fileRefs.map((f) => (
                <li key={`${f.path}:${f.line ?? ""}`} className="font-mono text-[11px] text-primary">
                  {f.path}
                  {f.line ? `:${f.line}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Accessible / non-visual equivalent of the diagram (also a plain fallback). */}
      {showText ? <FlowText flow={flow} /> : null}
      {showSource ? (
        <pre className="max-h-64 overflow-auto border-t border-border bg-foreground/[0.04] p-2.5 text-[0.72rem] leading-relaxed">
          {source}
        </pre>
      ) : null}
    </figure>
  );
}

function FlowText({ flow }: { flow: IFlowArtifact }) {
  const label = (id: string) => flow.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <div className="border-t border-border px-3 py-2.5 text-xs">
      <p className="font-semibold text-foreground">Nodes</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
        {flow.nodes.map((n) => (
          <li key={n.id}>
            {n.label}
            {n.kind ? ` (${KIND_LABEL[n.kind]})` : ""}
            {n.summary ? ` — ${n.summary}` : ""}
          </li>
        ))}
      </ul>
      {flow.edges.length ? (
        <>
          <p className="mt-2 font-semibold text-foreground">Connections</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {flow.edges.map((e) => (
              <li key={e.id}>
                {label(e.source)} → {label(e.target)}
                {e.label ? ` (${e.label})` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function MiniButton({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-[11px] font-medium transition-colors active:scale-[0.97]",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
