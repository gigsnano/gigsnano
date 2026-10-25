"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { IJourneyStep } from "@/types";

type Device = "desktop" | "mobile";

/** A representative placeholder screen — stands in for real generated output. */
function PreviewFrame({ device, caption }: { device: Device; caption: string }) {
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "overflow-hidden rounded-lg border bg-background shadow-sm transition-[width] duration-300 ease-out",
          device === "desktop" ? "w-full" : "w-[220px]",
        )}
      >
        <div className="flex items-center gap-1 border-b bg-muted/50 px-2 py-1.5">
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="ml-2 truncate text-[10px] text-muted-foreground">{caption}</span>
        </div>
        <div className="space-y-2 p-3">
          <div className="h-6 w-2/3 rounded bg-primary/20" />
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-5/6 rounded bg-muted" />
          <div className={cn("grid gap-2 pt-1", device === "desktop" ? "grid-cols-3" : "grid-cols-1")}>
            <div className="h-14 rounded bg-muted" />
            <div className="h-14 rounded bg-muted" />
            <div className="h-14 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Region 4 — output & live preview: output contract, device preview, versions. */
export function OutputPreview({ step, decisionSummary }: { step: IJourneyStep; decisionSummary: string }) {
  const [device, setDevice] = useState<Device>("desktop");

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Live output</h2>
        <div role="tablist" aria-label="Preview device" className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
          {(["desktop", "mobile"] as Device[]).map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={device === d}
              onClick={() => setDevice(d)}
              className={cn(
                "rounded-md px-2 py-1 font-medium capitalize transition-[color,background-color] duration-150 ease-out",
                device === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <PreviewFrame device={device} caption={decisionSummary || step.title} />

      {step.output ? (
        <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              className={cn("size-4", step.output.verified ? "text-emerald-500" : "text-muted-foreground/40")}
            />
            {step.output.label}
          </span>
          <span className="text-xs text-muted-foreground">
            v{step.output.version} · {step.output.verified ? "verified" : "draft"}
          </span>
        </div>
      ) : (
        <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          No output yet. Make the decisions, then approve to produce a verified version.
        </p>
      )}
    </div>
  );
}
