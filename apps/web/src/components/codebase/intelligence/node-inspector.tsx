"use client";

import { useState } from "react";
import { Copy01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { nodeTypeMeta, riskToneClass } from "@/lib/code/node-type";
import type { ICodeStoryRef } from "@/types/code/graph";
import type {
  INodeInspectorDetail,
  ITraceQc,
} from "@/types/code/intelligence";

type TInspectorTab = "overview" | "relations" | "traceability" | "history";
const TABS: { id: TInspectorTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "relations", label: "Relations" },
  { id: "traceability", label: "Traceability" },
  { id: "history", label: "History" },
];

const qcTone: Record<ITraceQc["outcome"], string> = {
  pass: "text-emerald-500",
  concerns: "text-amber-500",
  fail: "text-destructive",
};

export function NodeInspector({
  detail,
  liveStories = [],
  liveImpacted = [],
  onSelect,
  onAsk,
}: {
  detail: INodeInspectorDetail;
  liveStories?: ICodeStoryRef[];
  liveImpacted?: ICodeStoryRef[];
  onSelect: (id: string) => void;
  onAsk: () => void;
}) {
  const [tab, setTab] = useState<TInspectorTab>("overview");
  const meta = nodeTypeMeta(detail.type);

  return (
    <div className="flex size-full flex-col">
      {/* header */}
      <div className="border-b p-4">
        <div className="flex items-start gap-2">
          <HugeiconsIcon icon={meta.icon} className={cn("mt-0.5 size-4 shrink-0", meta.toneClass)} />
          <div className="min-w-0 flex-1">
            <div className="wrap-anywhere text-sm font-semibold text-foreground">{detail.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{meta.label}</span>
              {detail.status ? (
                <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium">
                  {detail.status}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {detail.path ? (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(detail.path ?? "")}
            className="group mt-2 flex w-full items-center gap-1.5 rounded font-mono text-[11px] text-muted-foreground hover:text-foreground"
            aria-label="Copy path"
          >
            <span className="truncate">{detail.path}</span>
            <HugeiconsIcon icon={Copy01Icon} className="size-3 opacity-0 group-hover:opacity-100" />
          </button>
        ) : null}
        {detail.owner ? (
          <div className="mt-1 text-xs text-muted-foreground">Owner · {detail.owner}</div>
        ) : null}
      </div>

      {/* tab bar */}
      <div role="tablist" className="flex items-center gap-0.5 border-b px-2 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              tab === t.id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
        {tab === "overview" ? <OverviewTab detail={detail} /> : null}
        {tab === "relations" ? <RelationsTab detail={detail} onSelect={onSelect} /> : null}
        {tab === "traceability" ? (
          <TraceabilityTab detail={detail} liveStories={liveStories} liveImpacted={liveImpacted} />
        ) : null}
        {tab === "history" ? <HistoryTab detail={detail} /> : null}
      </div>

      {/* actions */}
      <div className="flex flex-wrap gap-1.5 border-t p-3">
        <Button size="sm" onClick={onAsk} className="active:scale-[0.97]">
          <HugeiconsIcon icon={SparklesIcon} className="size-4" />
          Ask AI
        </Button>
        {["Open source", "Trace execution", "View impact"].map((a) => (
          <Button key={a} size="sm" variant="outline" className="active:scale-[0.97]">
            {a}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border px-2.5 py-1.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function OverviewTab({ detail }: { detail: INodeInspectorDetail }) {
  const agg = detail.aggregate;
  return (
    <div className="flex flex-col gap-4">
      {detail.purpose ? <p className="text-foreground/90">{detail.purpose}</p> : null}
      {agg ? (
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Nodes" value={agg.nodeCount} />
          <Stat label="Submodules" value={agg.submodules} />
          <Stat label="Files" value={agg.files} />
          <Stat label="Classes" value={agg.classes} />
          <Stat label="Functions" value={agg.functions} />
          <Stat label="Tests" value={agg.tests} />
          <div className="rounded-md border px-2.5 py-1.5">
            <div className="text-[11px] text-muted-foreground">Risk</div>
            <div className={cn("font-semibold capitalize", riskToneClass(agg.risk))}>
              {agg.risk ?? "—"}
            </div>
          </div>
          <div className="rounded-md border px-2.5 py-1.5">
            <div className="text-[11px] text-muted-foreground">Languages</div>
            <div className="truncate font-semibold text-foreground">
              {agg.languages.length > 0 ? agg.languages.join(", ") : "—"}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <Stat label="Inbound deps" value={detail.inbound} />
          <Stat label="Outbound deps" value={detail.outbound} />
          <Stat label="Tests" value={detail.tests} />
          <Stat label="Complexity" value={detail.complexity ?? "—"} />
        </div>
      )}
      {agg && agg.hotspots.length > 0 ? (
        <Section title="Hotspots">
          {agg.hotspots.map((h) => (
            <div key={h} className="font-mono text-xs text-foreground/90">{h}</div>
          ))}
        </Section>
      ) : null}
      {typeof detail.coverage === "number" ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Coverage</span>
            <span className="font-medium tabular-nums text-foreground">{detail.coverage}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                detail.coverage >= 80 ? "bg-emerald-500" : detail.coverage >= 60 ? "bg-amber-500" : "bg-destructive",
              )}
              style={{ width: `${detail.coverage}%` }}
            />
          </div>
        </div>
      ) : null}
      {detail.apis.length > 0 ? (
        <Section title="Related APIs">
          {detail.apis.map((a) => (
            <div key={a} className="font-mono text-xs text-foreground/90">{a}</div>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function RelationsTab({
  detail,
  onSelect,
}: {
  detail: INodeInspectorDetail;
  onSelect: (id: string) => void;
}) {
  const linkRow = (id: string, name: string) => (
    <button
      key={id}
      type="button"
      onClick={() => onSelect(id)}
      className="block w-full truncate rounded px-1.5 py-1 text-left text-xs text-foreground/90 hover:bg-accent"
    >
      {name}
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <Section title={`Dependencies (${detail.dependencies.length})`}>
        {detail.dependencies.map((d) => linkRow(d.id, d.name))}
      </Section>
      <Section title={`Dependents (${detail.dependents.length})`}>
        {detail.dependents.map((d) => linkRow(d.id, d.name))}
      </Section>
      {detail.relatedTables.length > 0 ? (
        <Section title="Related tables">
          {detail.relatedTables.map((t) => (
            <div key={t} className="font-mono text-xs text-foreground/90">{t}</div>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function TraceabilityTab({
  detail,
  liveStories,
  liveImpacted,
}: {
  detail: INodeInspectorDetail;
  liveStories: ICodeStoryRef[];
  liveImpacted: ICodeStoryRef[];
}) {
  const t = detail.traceability;
  const hasLive = liveStories.length > 0 || liveImpacted.length > 0;
  return (
    <div className="flex flex-col gap-4">
      {hasLive ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
            From the code graph
          </div>
          {liveStories.length > 0 ? (
            <div className="mb-1.5">
              <div className="text-[11px] text-muted-foreground">Modified by</div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {liveStories.map((s) => (
                  <span key={s.node_id} className="rounded border bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {s.code}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {liveImpacted.length > 0 ? (
            <div>
              <div className="text-[11px] text-muted-foreground">Impacted if changed</div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {liveImpacted.map((s) => (
                  <span key={s.node_id} className="rounded border bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {s.code}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {t.requirements.length > 0 ? (
        <Section title="Implements">
          {t.requirements.map((r) => (
            <div key={r.code} className="text-xs">
              <span className="font-mono font-medium text-primary">{r.code}</span>{" "}
              <span className="text-foreground/90">{r.title}</span>
            </div>
          ))}
        </Section>
      ) : null}
      {t.stories.length > 0 ? (
        <Section title="Stories">
          {t.stories.map((s) => (
            <div key={s.code} className="flex items-center gap-2 text-xs">
              <span className="font-mono font-medium text-primary">{s.code}</span>
              <span className="flex-1 truncate text-foreground/90">{s.title}</span>
              {s.status ? <span className="text-muted-foreground">{s.status}</span> : null}
            </div>
          ))}
        </Section>
      ) : null}
      {t.sprints.length > 0 ? (
        <Section title="Sprints">
          <div className="text-xs text-foreground/90">{t.sprints.join(" · ")}</div>
        </Section>
      ) : null}
      {t.prs.length > 0 ? (
        <Section title="Pull requests">
          {t.prs.map((p) => (
            <div key={p.number} className="text-xs">
              <span className="font-mono text-muted-foreground">#{p.number}</span>{" "}
              <span className="text-foreground/90">{p.title}</span>
            </div>
          ))}
        </Section>
      ) : null}
      {t.qc.length > 0 ? (
        <Section title="QC findings">
          {t.qc.map((q) => (
            <div key={q.label} className="flex items-center justify-between text-xs">
              <span className="text-foreground/90">{q.label}</span>
              <span className={cn("font-medium capitalize", qcTone[q.outcome])}>{q.outcome}</span>
            </div>
          ))}
        </Section>
      ) : null}
      {t.deployments.length > 0 ? (
        <Section title="Deployments">
          {t.deployments.map((d) => (
            <div key={d.env} className="flex items-center justify-between text-xs">
              <span className="text-foreground/90 capitalize">{d.env}</span>
              <span className="text-muted-foreground">{d.status} · {d.when}</span>
            </div>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function HistoryTab({ detail }: { detail: INodeInspectorDetail }) {
  if (detail.recentChanges.length === 0)
    return <p className="text-xs text-muted-foreground">No recent changes recorded.</p>;
  return (
    <div className="flex flex-col gap-2">
      {detail.recentChanges.map((c) => (
        <div key={c.pr} className="rounded-md border p-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">#{c.pr}</span>
            <span className="flex-1 truncate font-medium text-foreground">{c.title}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {c.author ? `${c.author} · ` : ""}{c.when}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
