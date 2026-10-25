"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserIcon,
  UserGroupIcon,
  Calendar03Icon,
  Tag01Icon,
  RocketIcon,
  PencilEdit02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { useAdjustedState } from "@/hooks/ui/use-adjusted-state";
import { useUser } from "@/hooks/workspace/use-users";
import { useProjectMembers } from "@/hooks/project/use-project-members";
import { useProjectPermissions } from "@/hooks/project/use-project-permissions";
import { useUpdateProject } from "@/hooks/project/use-project-settings";
import { EProjectPermission } from "@/lib/project-rbac";
import { authErrorMessage } from "@/lib/auth/auth-error";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EMemberStatus, type IProject } from "@/types";

/** Date-only values are rendered from their parts — `new Date("2026-07-01")` is
 *  parsed as UTC midnight and shows the previous day west of Greenwich. */
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const field =
  "h-9 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

/** Right-rail "Project State" tab — properties resolved from the project. Lead and
 *  the two dates are editable in place by admins/owners (GIN-487); everyone else
 *  keeps the compact read-only rows. The server is the authority (403 otherwise). */
export function ProjectStateTab({
  project,
  workspaceSlug,
  projectId,
}: {
  project: IProject;
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: lead } = useUser(project.lead_id ?? "");
  const canEdit = useProjectPermissions(workspaceSlug, projectId).can(
    EProjectPermission.ManageSettings,
  );

  const leadValue = lead ? (
    <span className="flex items-center gap-1.5">
      <Avatar name={lead.display_name} src={lead.avatar_url} size="xs" />
      <span className="truncate text-foreground">{lead.display_name}</span>
    </span>
  ) : (
    <span className="text-muted-foreground">Unassigned</span>
  );

  return (
    <div className="flex flex-col">
      <Row icon={RocketIcon} label="Sprint-0">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${project.sprint_zero_progress}%` }} />
          </div>
          <span className="tabular-nums text-foreground">{project.sprint_zero_progress}%</span>
        </div>
      </Row>

      <Row icon={UserIcon} label="Lead">
        {canEdit ? (
          <EditPopover label="Change project lead" value={leadValue}>
            {(close) => (
              <LeadEditor
                project={project}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                onDone={close}
              />
            )}
          </EditPopover>
        ) : (
          leadValue
        )}
      </Row>

      <Row icon={UserGroupIcon} label="Members">
        <div className="flex items-center gap-2">
          <AvatarGroup members={project.members} total={project.member_count} max={4} size="xs" />
          <span className="tabular-nums text-muted-foreground">{project.member_count}</span>
        </div>
      </Row>

      <DateRow
        label="Start"
        dateField="start_date"
        project={project}
        canEdit={canEdit}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />
      <DateRow
        label="Target"
        dateField="target_date"
        project={project}
        canEdit={canEdit}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />

      <Row icon={Tag01Icon} label="Identifier">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          {project.identifier}
        </span>
      </Row>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: IconSvgElement;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b py-2.5 text-sm last:border-b-0">
      <span className="flex w-24 shrink-0 items-center gap-2 text-muted-foreground">
        <HugeiconsIcon icon={icon} className="size-4" />
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function DateRow({
  label,
  dateField,
  project,
  canEdit,
  workspaceSlug,
  projectId,
}: {
  label: string;
  dateField: "start_date" | "target_date";
  project: IProject;
  canEdit: boolean;
  workspaceSlug: string;
  projectId: string;
}) {
  const value = <span className="text-foreground">{fmtDate(project[dateField])}</span>;
  return (
    <Row icon={Calendar03Icon} label={label}>
      {canEdit ? (
        <EditPopover label={`Change ${label.toLowerCase()} date`} value={value}>
          {(close) => (
            <DateEditor
              dateField={dateField}
              project={project}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              onDone={close}
            />
          )}
        </EditPopover>
      ) : (
        value
      )}
    </Row>
  );
}

/** Read-only row value that becomes a keyboard-reachable edit trigger. The editor
 *  mounts only while open, so each open starts from the project's saved value. */
function EditPopover({
  label,
  value,
  children,
}: {
  label: string;
  value: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="group -mx-1 flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1 truncate">{value}</span>
          <HugeiconsIcon
            icon={PencilEdit02Icon}
            className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        {open ? children(() => setOpen(false)) : null}
      </PopoverContent>
    </Popover>
  );
}

function LeadEditor({
  project,
  workspaceSlug,
  projectId,
  onDone,
}: {
  project: IProject;
  workspaceSlug: string;
  projectId: string;
  onDone: () => void;
}) {
  const { data: members } = useProjectMembers(workspaceSlug, projectId);
  const update = useUpdateProject(workspaceSlug, projectId);
  const [query, setQuery] = useState("");
  // Draft selection seeded from the saved lead; if another owner changes it while
  // this picker is open, the draft re-syncs rather than silently overwriting.
  const [selected, setSelected] = useAdjustedState<string | null>(project.lead_id);

  // Only active project members are eligible — picking someone else has to go
  // through "add to project" first, so we never add a member as a side effect.
  const q = query.trim().toLowerCase();
  const active = (members ?? []).filter((m) => m.status === EMemberStatus.Active);
  const matches = q
    ? active.filter(
        (m) => m.display_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      )
    : active;

  const save = async () => {
    try {
      await update.mutateAsync({ lead_id: selected });
      onDone();
    } catch {
      // Keep the picked value on screen; the error line below offers a retry.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        aria-label="Search project members"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search members…"
        className={field}
      />

      <div role="listbox" aria-label="Project lead" className="max-h-52 overflow-y-auto">
        {matches.map((m) => (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={m.user_id === selected}
            onClick={() => setSelected(m.user_id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
              m.user_id === selected && "bg-muted",
            )}
          >
            <Avatar name={m.display_name} src={m.avatar_url} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {m.display_name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
            </span>
            {m.user_id === selected ? (
              <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />
            ) : null}
          </button>
        ))}

        {matches.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No matching project member. Add the person to the project first.
          </p>
        ) : null}
      </div>

      <SaveBar
        pending={update.isPending}
        error={update.isError ? authErrorMessage(update.error) : null}
        disabled={selected === project.lead_id}
        onCancel={onDone}
        onSave={save}
      />
    </div>
  );
}

function DateEditor({
  dateField,
  project,
  workspaceSlug,
  projectId,
  onDone,
}: {
  dateField: "start_date" | "target_date";
  project: IProject;
  workspaceSlug: string;
  projectId: string;
  onDone: () => void;
}) {
  const update = useUpdateProject(workspaceSlug, projectId);
  const [value, setValue] = useAdjustedState(project[dateField]);

  // Validate the effective pair, so moving one date can't leave target < start.
  // YYYY-MM-DD strings order correctly, so no Date parsing (and no tz shift).
  const start = dateField === "start_date" ? value : project.start_date;
  const target = dateField === "target_date" ? value : project.target_date;
  const invalid = Boolean(start && target && target < start);
  const problem = !value
    ? "Pick a date."
    : invalid
      ? dateField === "start_date"
        ? `Start must be on or before the target date (${fmtDate(project.target_date)}). Move the target date first.`
        : `Target must be on or after the start date (${fmtDate(project.start_date)}).`
      : null;

  const save = async () => {
    try {
      await update.mutateAsync(
        dateField === "start_date" ? { start_date: value } : { target_date: value },
      );
      onDone();
    } catch {
      // Keep the edited value on screen; the error line below offers a retry.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="date"
        aria-label={dateField === "start_date" ? "Start date" : "Target date"}
        aria-invalid={Boolean(problem)}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={field}
      />
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}

      <SaveBar
        pending={update.isPending}
        error={update.isError ? authErrorMessage(update.error) : null}
        disabled={Boolean(problem) || value === project[dateField]}
        onCancel={onDone}
        onSave={save}
      />
    </div>
  );
}

function SaveBar({
  pending,
  error,
  disabled,
  onCancel,
  onSave,
}: {
  pending: boolean;
  error: string | null;
  disabled: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending || disabled}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );
}
