"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert01Icon,
  CheckmarkBadge01Icon,
  LockIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";

import { AcceptAndRunButton } from "@/components/ai/delegation/accept-and-run-button";
import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import { Button } from "@/components/ui/button";
import { useProject } from "@/hooks/project/use-projects";
import { APIError } from "@/services/api-error";
import { ECloneStatus } from "@/types";
import {
  useExecutionProfile,
  useOverrideProfile,
  useResolveProfile,
  useSkillEvents,
} from "@/hooks/story/use-execution-profile";
import { useStoryRuns } from "@/hooks/story/use-story-detail";
import { evidenceLabel, groupSkills } from "@/lib/issues/execution-profile";
import { cn } from "@/lib/utils";
import type {
  EAgentTarget,
  ESkillMode,
  IExecutionProfileEnvelope,
  IExecutionProfileSkill,
} from "@/types/story/execution-profile";

const AGENTS: { value: EAgentTarget; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "cursor", label: "Cursor" },
];

const OVERRIDE_MODES: { value: ESkillMode | "removed"; label: string }[] = [
  { value: "required", label: "Required" },
  { value: "recommended", label: "Recommended" },
  { value: "prohibited", label: "Prohibited" },
  { value: "removed", label: "Remove" },
];

const SELECT =
  "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const GROUP_META: { mode: ESkillMode; label: string; dot: string }[] = [
  { mode: "required", label: "Required", dot: "bg-primary" },
  { mode: "recommended", label: "Recommended", dot: "bg-muted-foreground" },
  { mode: "prohibited", label: "Prohibited", dot: "bg-destructive" },
];

function shortDigest(digest: string | null): string {
  if (!digest) return "—";
  const hex = digest.replace(/^sha256:/, "");
  return hex.length > 10 ? `${hex.slice(0, 10)}…` : hex;
}

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "primary" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** One skill row inside a mode group. Shows the pin, the version+digest, source,
 * and (when the policy is not locked) an inline override editor. */
function SkillRow({
  skill,
  locked,
  onOverride,
  saving,
}: {
  skill: IExecutionProfileSkill;
  locked: boolean;
  onOverride: (skillId: string, mode: string, reason: string) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<string>(skill.mode);
  const [reason, setReason] = useState("");
  const pinned = skill.status === "pinned";

  return (
    <li className="rounded-md px-1 py-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-1 motion-safe:duration-200">
      <div className="flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", pinned ? "bg-primary" : "bg-muted-foreground/50")}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{skill.skillId}</span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
            pinned ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {pinned ? "pinned" : "unavailable"}
        </span>
        {!locked && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label={`Override ${skill.skillId}`}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Override
          </button>
        )}
      </div>
      <div className="ml-3.5 mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span title={skill.version ?? undefined}>{skill.version ?? "no version"}</span>
        <span aria-hidden>·</span>
        <span className="font-mono" title={skill.digest ?? undefined}>
          {shortDigest(skill.digest)}
        </span>
        <span aria-hidden>·</span>
        <span>{skill.source}</span>
      </div>

      {editing && !locked && (
        <div className="ml-3.5 mt-2 space-y-2 rounded-md border border-border bg-muted/30 p-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150">
          <div className="flex items-center gap-2">
            <label htmlFor={`mode-${skill.skillId}`} className="text-[11px] text-muted-foreground">
              Set to
            </label>
            <select
              id={`mode-${skill.skillId}`}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className={SELECT}
            >
              {OVERRIDE_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <input
            aria-label={`Reason for overriding ${skill.skillId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!reason.trim() || saving}
              onClick={() => {
                onOverride(skill.skillId, mode, reason.trim());
                setEditing(false);
                setReason("");
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function EvidenceTimeline({
  workspaceSlug,
  projectId,
  storyId,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
}) {
  const { data: runs } = useStoryRuns(workspaceSlug, projectId, storyId);
  // The latest run carries the freshest delivery/verification evidence.
  const latestRun = runs && runs.length > 0 ? runs[runs.length - 1] : null;
  const { data: events } = useSkillEvents(workspaceSlug, projectId, storyId, latestRun?.id ?? null);

  if (!latestRun || !events || events.events.length === 0) {
    return (
      <p className="rounded-md bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
        Not executed yet — the skills above are planned, not run.
      </p>
    );
  }

  return (
    <ol className="space-y-1">
      {events.events.map((ev) => {
        const failed = ev.state === "failed";
        const verified = ev.state === "gate_verified";
        return (
          <li
            key={ev.id}
            className="flex items-center gap-2 text-[11px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
          >
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 font-medium",
                failed
                  ? "bg-destructive/10 text-destructive"
                  : verified
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {evidenceLabel(ev.state)}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">{ev.skill_id}</span>
            {ev.reason && <span className="shrink-0 text-muted-foreground">{ev.reason}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function ProfileBody({
  envelope,
  workspaceSlug,
  projectId,
  storyId,
}: {
  envelope: IExecutionProfileEnvelope;
  workspaceSlug: string;
  projectId: string;
  storyId: string;
}) {
  const override = useOverrideProfile(workspaceSlug, projectId, storyId);
  const project = useProject(workspaceSlug, projectId);
  const { profile, policy, stale } = envelope;
  const locked = policy === "locked";
  const groups = groupSkills(profile.skills);
  const hasRepo = project.data?.clone_status === ECloneStatus.Ready;

  const applyOverride = (skillId: string, mode: string, reason: string) =>
    override.mutate({ changes: [{ skillId, mode: mode as ESkillMode | "removed" }], reason });

  return (
    <div className="space-y-3">
      {stale && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200 dark:text-amber-400">
          <HugeiconsIcon icon={Alert01Icon} size={14} className="mt-0.5 shrink-0" />
          <span>This profile is out of date (the work item or registry changed). Re-resolve before running.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="primary">{profile.classification.work_type}</Chip>
        {profile.classification.domains.map((d) => (
          <Chip key={d}>{d}</Chip>
        ))}
        <span className="text-[11px] text-muted-foreground">{profile.confidence} confidence</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          {locked && <HugeiconsIcon icon={LockIcon} size={12} />}
          policy: {policy}
        </span>
      </div>

      <AcceptAndRunButton
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        storyId={storyId}
        hasRepo={hasRepo}
        stale={stale}
      />

      {GROUP_META.map(({ mode, label, dot }) => {
        const skills = groups[mode];
        if (skills.length === 0) return null;
        return (
          <div key={mode} className="space-y-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
              {label}
            </p>
            <ul className="space-y-0.5">
              {skills.map((skill) => (
                <SkillRow
                  key={skill.skillId}
                  skill={skill}
                  locked={locked}
                  saving={override.isPending}
                  onOverride={applyOverride}
                />
              ))}
            </ul>
          </div>
        );
      })}

      {profile.gates.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gates</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.gates.map((g) => (
              <span
                key={g}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <HugeiconsIcon icon={CheckmarkBadge01Icon} size={11} />
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence</p>
        <EvidenceTimeline workspaceSlug={workspaceSlug} projectId={projectId} storyId={storyId} />
      </div>

      {envelope.override_history.length > 0 && (
        <details className="group text-[11px]">
          <summary className="cursor-pointer list-none font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
            Overrides ({envelope.override_history.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {envelope.override_history.map((entry, i) => (
              <li key={`${entry.reason}-${i}`} className="text-muted-foreground">
                <span className="text-foreground">{entry.reason || "(no reason)"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function IssueExecutionProfile({
  storyId,
  workspaceSlug,
  projectId,
}: {
  storyId: string;
  workspaceSlug: string;
  projectId: string;
}) {
  const [agent, setAgent] = useState<EAgentTarget>("auto");
  const { data, isLoading, error } = useExecutionProfile(workspaceSlug, projectId, storyId);
  const resolve = useResolveProfile(workspaceSlug, projectId, storyId);

  const notResolved = error instanceof APIError && error.status === 404;
  const loadError = Boolean(error) && !notResolved; // a real failure, not "not resolved yet"
  const skillCount = data?.profile.skills.length;

  const action = (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Execution agent"
        value={agent}
        onChange={(e) => {
          // The profile is agent-specific — re-resolve for the newly chosen agent.
          const next = e.target.value as EAgentTarget;
          setAgent(next);
          resolve.mutate({ agent: next });
        }}
        className={SELECT}
      >
        {AGENTS.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
      <Button
        variant="ghost"
        size="sm"
        disabled={resolve.isPending}
        onClick={() => resolve.mutate({ agent })}
      >
        <HugeiconsIcon
          icon={RefreshIcon}
          size={14}
          className={cn(resolve.isPending && "motion-safe:animate-spin")}
        />
        {data ? "Re-resolve" : "Resolve"}
      </Button>
    </div>
  );

  return (
    <IssueCollapsibleSection title="Execution Profile" count={skillCount} action={action}>
      {isLoading ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">Loading profile…</p>
      ) : loadError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-2 text-sm text-destructive">
          Couldn&apos;t load the execution profile. Try re-resolving.
        </p>
      ) : notResolved || !data ? (
        <p className="rounded-md bg-muted/30 px-2 py-2 text-sm text-muted-foreground">
          No execution profile yet. Resolve one to see the pinned skills, gates and policy for this work item.
        </p>
      ) : (
        <ProfileBody
          envelope={data}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          storyId={storyId}
        />
      )}
    </IssueCollapsibleSection>
  );
}
