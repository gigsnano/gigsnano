"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FOUNDATION_PRESETS } from "@/constants/foundation-presets";
import {
  useDetectStack,
  useLockFoundation,
  useProposeChange,
} from "@/hooks/project/use-foundation";
import { APIError } from "@/services/api-error";
import { cn } from "@/lib/utils";
import type { IFoundation, ILockFoundationPayload } from "@/types/project/foundation";

/** The backend's `detail` (e.g. a compatibility conflict), or a generic fallback. */
function lockErrorMessage(err: unknown): string {
  const detail = err instanceof APIError ? (err.data as { detail?: string })?.detail : undefined;
  return detail || "Could not lock this stack.";
}

/** Split a comma/newline-separated field into trimmed, non-empty tokens. */
function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const DATABASES = ["postgres", "mysql", "sqlite", "mongodb", "redis", "neo4j"];
const ARCHITECTURES = [
  "normalized",
  "star",
  "denormalized",
  "document",
  "graph",
  "keyvalue",
  "cqrs",
  "event-sourced",
];
const SELECT_CLASS =
  "w-full rounded-md border border-border bg-background p-2 text-xs text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function FoundationSetup({
  workspaceSlug,
  projectId,
  current,
}: {
  workspaceSlug: string;
  projectId: string;
  current: IFoundation | null;
}) {
  const lock = useLockFoundation(workspaceSlug, projectId);
  const propose = useProposeChange(workspaceSlug, projectId);
  const { data: detection } = useDetectStack(workspaceSlug, projectId, !current);
  const [libs, setLibs] = useState("");
  const [gates, setGates] = useState("react-doctor");
  const [tokens, setTokens] = useState(true);
  const [database, setDatabase] = useState("");
  const [architecture, setArchitecture] = useState("");
  // Propose-for-review vs lock-now (GIN-196) — only meaningful once a Foundation
  // is already locked; the first lock is always direct.
  const [proposeMode, setProposeMode] = useState(false);
  const isCustom = current?.preset_key === "custom";
  const suggested = !current
    ? FOUNDATION_PRESETS.find((p) => p.key === detection?.suggested_preset)
    : undefined;

  const action = proposeMode ? propose : lock;
  const busy = action.isPending;
  const submit = (payload: ILockFoundationPayload) => action.mutate(payload);
  const actionLabel = (idle: string) =>
    busy ? (proposeMode ? "Proposing…" : "Locking…") : proposeMode ? "Propose change" : idle;

  return (
    <div id="foundation-presets" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Choose a Foundation preset</h2>
        {current && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={proposeMode} onCheckedChange={(v) => setProposeMode(v === true)} />
            Propose for review (don&rsquo;t lock now)
          </label>
        )}
      </div>

      {suggested && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 px-4 py-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-300">
          <p className="text-sm text-foreground">
            Detected <span className="font-medium">{suggested.label}</span> in your repo.
          </p>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => submit({ preset_key: suggested.key })}
            className="shrink-0 transition-transform duration-100 active:scale-[0.98]"
          >
            {actionLabel("Use it")}
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {FOUNDATION_PRESETS.map((preset) => {
          const isCurrent = current?.preset_key === preset.key;
          return (
            <div
              key={preset.key}
              className={cn(
                "flex flex-col justify-between rounded-md border bg-card p-4 transition-colors duration-150",
                isCurrent
                  ? "border-primary/50 ring-1 ring-primary/20"
                  : "border-border hover:border-foreground/25",
              )}
            >
              <div>
                <p className="text-sm font-medium text-foreground">{preset.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
              </div>
              <div className="mt-3">
                {isCurrent ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                    <span aria-hidden>✓</span> Locked · v{current?.version}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => submit({ preset_key: preset.key })}
                    className="transition-transform duration-100 active:scale-[0.98]"
                  >
                    {actionLabel("Use this")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <details className="rounded-md border border-border bg-card p-4 [&_summary]:cursor-pointer">
        <summary className="text-sm font-medium text-foreground">
          Or compose your own stack
          {isCustom && (
            <span className="ml-2 text-xs font-normal text-primary">
              ✓ Locked · v{current?.version}
              {current?.database ? ` · ${current.database}/${current.architecture}` : ""}
            </span>
          )}
        </summary>
        <div className="mt-3 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Allowed libraries (comma or newline separated)
            </span>
            <textarea
              value={libs}
              onChange={(e) => setLibs(e.target.value)}
              placeholder="react, react-dom, @tanstack/react-query"
              className="h-20 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Database engine</span>
              <select
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                aria-label="Database engine"
                className={SELECT_CLASS}
              >
                <option value="">None</option>
                {DATABASES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Data architecture</span>
              <select
                value={architecture}
                onChange={(e) => setArchitecture(e.target.value)}
                aria-label="Data architecture"
                className={SELECT_CLASS}
              >
                <option value="">None</option>
                {ARCHITECTURES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Quality gates</span>
            <input
              value={gates}
              onChange={(e) => setGates(e.target.value)}
              placeholder="react-doctor"
              className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={tokens} onCheckedChange={(v) => setTokens(v === true)} />
            <span className="text-xs">Enforce design tokens (no hardcoded colors)</span>
          </label>
          {action.isError && (
            <p role="alert" className="text-xs text-destructive">
              {lockErrorMessage(action.error)}
            </p>
          )}
          <Button
            size="sm"
            disabled={busy || parseList(libs).length === 0}
            onClick={() =>
              submit({
                allowed_libraries: parseList(libs),
                enforce_design_tokens: tokens,
                quality_gates: parseList(gates),
                database: database || undefined,
                architecture: architecture || undefined,
              })
            }
            className="transition-transform duration-100 active:scale-[0.98]"
          >
            {actionLabel("Validate & lock stack")}
          </Button>
        </div>
      </details>
    </div>
  );
}
