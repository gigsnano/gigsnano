"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  GitCompareIcon,
  SparklesIcon,
  ArrowUpRight01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import {
  DIRECTIONS,
  DEFAULT_TOKENS,
  applyDirection,
  buildExperienceContract,
  screensFor,
  TEMPLATES,
  ENTRY_MODES,
  type EntryMode,
  type IExperienceContract,
  type ITokens,
} from "@/lib/journey/experience";
import { useExperienceContract, useSaveExperienceContract } from "@/hooks/journey/use-journey";
import { EmptyState } from "@/components/empty-state";

import { ExperiencePreview } from "./experience-preview";
import { TokenControls } from "./token-controls";
import { TemplateGallery } from "./template-gallery";
import { DirectionCards } from "./direction-cards";
import { ReviewPanel } from "./review-panel";

type Tab = "Templates" | "Direction" | "Design system" | "Screens" | "Flows";
const TABS: Tab[] = ["Templates", "Direction", "Design system", "Screens", "Flows"];
const OPEN_DECISIONS = ["Empty & error states", "Loading skeletons"];

function ExperienceStudioInner({
  workspaceSlug,
  projectId,
  stepId,
  approver,
  initialContract,
}: {
  workspaceSlug: string;
  projectId: string;
  stepId?: string;
  approver: string;
  initialContract: IExperienceContract | null;
}) {
  const c = initialContract;
  const [entry, setEntry] = useState<EntryMode>("Recommended");
  const [tab, setTab] = useState<Tab>("Direction");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [directionId, setDirectionId] = useState(c?.directionId ?? "focused");
  const [templateId, setTemplateId] = useState(c?.templateId ?? "saas-dashboard");
  const [tokens, setTokens] = useState<ITokens>(
    () => c?.tokens ?? applyDirection(DEFAULT_TOKENS, DIRECTIONS.find((d) => d.id === "focused")!),
  );
  const [nav, setNav] = useState<"sidebar" | "topbar">("sidebar");
  const [a11y, setA11y] = useState<"AA" | "AAA">("AA");
  const [version, setVersion] = useState(c?.version ?? 1);
  const [approved, setApproved] = useState(Boolean(c));

  const save = useSaveExperienceContract(workspaceSlug, projectId);
  const handleApprove = () => {
    if (save.isPending) return; // re-entry guard
    const direction = DIRECTIONS.find((d) => d.id === directionId)!;
    save.mutate(
      buildExperienceContract({ version, direction, templateId, tokens, approver, openDecisions: OPEN_DECISIONS }),
      { onSuccess: () => setApproved(true) },
    );
  };

  const backHref = stepId
    ? `/${workspaceSlug}/projects/${projectId}/journey/${stepId}`
    : `/${workspaceSlug}/projects/${projectId}/journey`;
  const templateName = TEMPLATES.find((t) => t.id === templateId)?.name ?? "App";

  const patchTokens = (patch: Partial<ITokens>) => {
    setTokens((prev) => ({ ...prev, ...patch }));
    setApproved(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          Back
        </Link>
        <span className="text-sm font-semibold text-foreground">Experience direction</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Draft {version}</span>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-1 sm:flex">
            {ENTRY_MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={entry === m}
                onClick={() => {
                  setEntry(m);
                  if (m === "Templates") setTab("Templates");
                  if (m === "Blank") setTemplateId("blank");
                }}
                className={cn(
                  "rounded-full px-2 py-1 text-xs font-medium transition-colors",
                  entry === m ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div role="tablist" aria-label="Preview device" className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
            {(["desktop", "mobile"] as const).map((d) => (
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
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Studio section" className="flex gap-1 overflow-x-auto border-b px-3 py-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr_18rem]">
          {/* Left — tab working area */}
          <div>
            {tab === "Templates" ? (
              <TemplateGallery templateId={templateId} onSelect={setTemplateId} />
            ) : tab === "Direction" ? (
              <DirectionCards
                directionId={directionId}
                onSelect={(d) => {
                  setDirectionId(d.id);
                  setTokens((prev) => applyDirection(prev, d));
                  setApproved(false);
                }}
              />
            ) : tab === "Design system" ? (
              <TokenControls tokens={tokens} onChange={patchTokens} nav={nav} onNav={setNav} a11y={a11y} onA11y={setA11y} />
            ) : tab === "Screens" ? (
              <div className="space-y-2 rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Screen inventory</h2>
                <ul className="space-y-1">
                  {screensFor(templateId).map((s) => (
                    <li key={s} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted/60">
                      <span className="size-1.5 rounded-full" style={{ background: tokens.accent }} />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">Core flow</h2>
                <ol className="space-y-1.5">
                  {["Enter", "Browse / search", "Select", "Confirm", "Success"].map((s, i) => (
                    <li key={s} className="flex items-center gap-2 text-sm text-foreground">
                      <span
                        className="flex size-5 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        style={{ background: tokens.accent }}
                      >
                        {i + 1}
                      </span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Center — live preview */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Live representative preview · {templateName}</p>
            <ExperiencePreview device={device} tokens={tokens} templateName={templateName} />
          </div>

          {/* Right — review */}
          <ReviewPanel
            version={version}
            approver={approver}
            approved={approved}
            openDecisions={OPEN_DECISIONS}
            onApprove={handleApprove}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        {save.isError ? (
          <span className="text-xs font-medium text-destructive">Couldn&apos;t save — try Approve again.</span>
        ) : null}
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60">
          <HugeiconsIcon icon={GitCompareIcon} className="size-4" />
          Compare versions
        </button>
        <button
          type="button"
          onClick={() => {
            setVersion((v) => v + 1);
            setApproved(false);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
        >
          <HugeiconsIcon icon={SparklesIcon} className="size-4" />
          Refine with AI
        </button>
        <button type="button" disabled className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground opacity-60">
          <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" />
          Export to Figma
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {DIRECTIONS.find((d) => d.id === directionId)?.name} · {tokens.density} · {a11y}
        </span>
      </div>
    </div>
  );
}

/**
 * Loads the saved Experience Contract (GIN-431) and mounts the studio seeded
 * from it — or from defaults when none is saved. Approve persists via the real
 * .../journey/experience/ endpoint. Gating on load lets the inner seed its state
 * from the contract in useState initializers (no setState-in-effect).
 */
export function ExperienceStudio(props: {
  workspaceSlug: string;
  projectId: string;
  stepId?: string;
  approver: string;
}) {
  const { data, isPending, isError, refetch } = useExperienceContract(
    props.workspaceSlug,
    props.projectId,
  );

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Loading experience direction…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load the experience direction"
          description="Something went wrong. Please try again."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }
  return <ExperienceStudioInner {...props} initialContract={data ?? null} />;
}
