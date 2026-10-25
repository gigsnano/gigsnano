"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Database01Icon,
  PaintBoardIcon,
  PackageIcon,
  ShieldKeyIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { FOUNDATION_PRESETS } from "@/constants/foundation-presets";
import { useArtifacts } from "@/hooks/project/use-foundation";
import { cn } from "@/lib/utils";
import type { IFoundation } from "@/types/project/foundation";

/** shadcn design-token swatches — a live, theme-aware preview of the enforced palette. */
const TOKEN_SWATCHES: { cls: string; label: string }[] = [
  { cls: "bg-primary", label: "primary" },
  { cls: "bg-secondary", label: "secondary" },
  { cls: "bg-accent", label: "accent" },
  { cls: "bg-muted", label: "muted" },
  { cls: "bg-destructive", label: "destructive" },
  { cls: "bg-foreground", label: "foreground" },
  { cls: "bg-background", label: "background" },
];

const TYPE_LABEL: Record<string, string> = {
  skill: "skill",
  design_system: "design system",
  persona: "persona",
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80">
      {children}
    </span>
  );
}

function Card({
  icon,
  title,
  delay,
  children,
}: {
  icon: IconSvgElement;
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-card p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:ease-out"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={icon} className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

/** The locked Foundation at a glance — the "living page" overview (GIN-196). */
export function FoundationSummary({
  workspaceSlug,
  foundation,
}: {
  workspaceSlug: string;
  foundation: IFoundation;
}) {
  const { data: artifacts } = useArtifacts(workspaceSlug);
  const presetLabel =
    FOUNDATION_PRESETS.find((p) => p.key === foundation.preset_key)?.label ??
    (foundation.preset_key === "custom" ? "Custom stack" : foundation.preset_key);

  const nameOf = (id: string) => {
    const found = artifacts?.find((a) => a.id === id)?.name;
    return found ?? id.split(":").slice(1).join(":") ?? id;
  };
  const typeOf = (id: string) =>
    artifacts?.find((a) => a.id === id)?.artifact_type ?? id.split(":")[0];

  const designSystemId = foundation.pinned_artifacts.find((id) => typeOf(id) === "design_system");
  const designSystem = designSystemId
    ? nameOf(designSystemId)
    : foundation.enforce_design_tokens
      ? "shadcn/Tailwind tokens"
      : "—";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card icon={PackageIcon} title="Stack" delay={0}>
        <p className="text-sm font-medium text-foreground">{presetLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {foundation.allowed_libraries.length ? (
            foundation.allowed_libraries.map((lib) => <Chip key={lib}>{lib}</Chip>)
          ) : (
            <span className="text-xs text-muted-foreground">No library allow-list.</span>
          )}
        </div>
        {foundation.database && (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Database01Icon} className="size-3.5" />
            {foundation.database}
            {foundation.architecture ? ` · ${foundation.architecture}` : ""}
          </div>
        )}
      </Card>

      <Card icon={PaintBoardIcon} title="Design system" delay={60}>
        <p className="text-sm font-medium text-foreground">{designSystem}</p>
        <div className="flex flex-wrap gap-1.5" aria-hidden>
          {TOKEN_SWATCHES.map((t) => (
            <span
              key={t.label}
              title={t.label}
              className={cn("size-6 rounded-md border border-border", t.cls)}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {foundation.enforce_design_tokens
            ? "Design tokens enforced — hardcoded colors are blocked."
            : "Design-token enforcement is off."}
        </p>
      </Card>

      <Card icon={ShieldKeyIcon} title="Standards" delay={120}>
        <div className="flex flex-wrap gap-1.5">
          {foundation.quality_gates.length ? (
            foundation.quality_gates.map((g) => <Chip key={g}>{g}</Chip>)
          ) : (
            <span className="text-xs text-muted-foreground">No quality gates set.</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Gates run on every deliverable; a failing gate blocks acceptance.
        </p>
      </Card>

      <Card icon={PackageIcon} title="Loaded artifacts" delay={180}>
        {foundation.pinned_artifacts.length ? (
          <div className="flex flex-wrap gap-1.5">
            {foundation.pinned_artifacts.map((id) => (
              <Chip key={id}>
                <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[typeOf(id)] ?? typeOf(id)}
                </span>
                {nameOf(id)}
              </Chip>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            No skills, design systems, or personas loaded yet.
          </span>
        )}
      </Card>
    </div>
  );
}
