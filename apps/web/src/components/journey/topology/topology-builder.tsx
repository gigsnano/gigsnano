"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  PlusSignIcon,
  Copy01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import {
  seedTopology,
  validateTopology,
  toMermaid,
  LAYER_TYPE_LABEL,
  type ILayer,
  type ITopology,
} from "@/lib/journey/topology";
import { useTopology, useSaveTopology } from "@/hooks/journey/use-journey";
import { EmptyState } from "@/components/empty-state";

import { TopologyCanvas } from "./topology-canvas";
import { TopologyTable } from "./topology-table";
import { ValidationPanel } from "./validation-panel";

type View = "Current" | "Target" | "Transition";
const VIEWS: View[] = ["Current", "Target", "Transition"];

const ANALYTICS: ILayer = {
  id: "analytics",
  name: "Analytics pipeline",
  type: "analytics",
  purpose: "Product & usage analytics",
  tech: "dbt + warehouse",
  repo: "acme/analytics",
  owner: "Data team",
  environments: ["prod"],
  dataClass: "internal",
  maturity: "planned",
};

function LayerDetail({ layer }: { layer: ILayer | null }) {
  if (!layer) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Select a layer in the diagram or table to see its properties.
      </div>
    );
  }
  const rows: [string, string][] = [
    ["Type", LAYER_TYPE_LABEL[layer.type]],
    ["Purpose", layer.purpose],
    ["Technology", layer.tech],
    ["Repository", layer.repo],
    ["Owner", layer.owner ?? "Unassigned"],
    ["Environments", layer.environments.join(", ") || "—"],
    ["Data class", layer.dataClass],
    ["Maturity", layer.maturity],
  ];
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{layer.name}</h2>
      <dl className="divide-y">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[7rem_1fr] gap-2 py-1.5 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={cn("min-w-0 capitalize text-foreground", !layer.owner && k === "Owner" && "text-amber-600 dark:text-amber-400")}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TopologyBuilderInner({
  workspaceSlug,
  projectId,
  stepId,
  initialTopology,
}: {
  workspaceSlug: string;
  projectId: string;
  stepId?: string;
  initialTopology: ITopology | null;
}) {
  const [current, setCurrent] = useState<ITopology>(() => initialTopology ?? seedTopology());
  const [view, setView] = useState<View>("Current");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMermaid, setShowMermaid] = useState(false);
  const [approved, setApproved] = useState(Boolean(initialTopology));
  const addCountRef = useRef(0);

  const save = useSaveTopology(workspaceSlug, projectId);
  const handleApprove = () => {
    if (save.isPending) return; // re-entry guard
    save.mutate(current, { onSuccess: () => setApproved(true) });
  };

  const target: ITopology = {
    layers: [...current.layers, ANALYTICS],
    dependencies: [...current.dependencies, { from: "api", to: "analytics", interface: "events", rationale: "Emit product events" }],
  };
  const shown = view === "Current" ? current : target;
  const issues = validateTopology(shown);
  const hasErrors = issues.some((i) => i.severity === "error");
  const selected = shown.layers.find((l) => l.id === selectedId) ?? null;

  const backHref = stepId
    ? `/${workspaceSlug}/projects/${projectId}/journey/${stepId}`
    : `/${workspaceSlug}/projects/${projectId}/journey`;

  const addLayer = () => {
    const n = ++addCountRef.current;
    setCurrent((prev) => ({
      ...prev,
      layers: [
        ...prev.layers,
        { id: `custom-${n}`, name: `New layer ${n}`, type: "custom", purpose: "", tech: "", repo: "—", owner: null, environments: [], dataClass: "none", maturity: "planned" },
      ],
    }));
    setApproved(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
        <Link href={backHref} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          Back
        </Link>
        <span className="text-sm font-semibold text-foreground">Solution topology</span>
        <div role="tablist" aria-label="Topology view" className="ml-auto inline-flex rounded-lg bg-muted p-0.5 text-xs">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-[color,background-color] duration-150 ease-out",
                view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {view === "Transition" ? (
          <p className="mb-3 rounded-lg border border-primary/30 bg-primary/[0.04] px-3 py-2 text-xs text-muted-foreground">
            Transition plan: introduce the <span className="font-medium text-foreground">Analytics pipeline</span> and its
            event feed from the API, without changing existing layers.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <TopologyCanvas topology={shown} selectedId={selectedId} onSelect={setSelectedId} />
            <TopologyTable topology={shown} selectedId={selectedId} onSelect={setSelectedId} />
            {showMermaid ? (
              <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">{toMermaid(shown)}</pre>
            ) : null}
          </div>
          <div className="space-y-4">
            <LayerDetail layer={selected} />
            <ValidationPanel issues={issues} onSelect={setSelectedId} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <button
          type="button"
          onClick={addLayer}
          disabled={view !== "Current"}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
        >
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
          Add layer
        </button>
        <button
          type="button"
          onClick={() => setShowMermaid((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
        >
          <HugeiconsIcon icon={Copy01Icon} className="size-4" />
          {showMermaid ? "Hide Mermaid" : "Export Mermaid"}
        </button>

        <button
          type="button"
          onClick={handleApprove}
          disabled={hasErrors || approved || save.isPending}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium shadow-sm transition-[transform,background-color] duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
            approved ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {approved ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" /> : null}
          {save.isPending ? "Saving…" : approved ? "Topology approved" : "Approve topology"}
        </button>
        {save.isError ? (
          <span className="text-xs font-medium text-destructive">Couldn&apos;t save — try again.</span>
        ) : hasErrors && !approved ? (
          <span className="text-xs text-muted-foreground">Resolve errors to approve.</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Loads the saved Solution Topology (GIN-430) and mounts the builder seeded from
 * it — or from the recommended seed when none is saved. Approve persists via the
 * real .../journey/topology/ endpoint.
 */
export function TopologyBuilder(props: {
  workspaceSlug: string;
  projectId: string;
  stepId?: string;
}) {
  const { data, isPending, isError, refetch } = useTopology(props.workspaceSlug, props.projectId);

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Loading solution topology…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load the topology"
          description="Something went wrong. Please try again."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }
  return <TopologyBuilderInner {...props} initialTopology={data ?? null} />;
}
