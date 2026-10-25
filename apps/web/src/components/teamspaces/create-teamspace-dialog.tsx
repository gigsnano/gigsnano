"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMembers } from "@/hooks/workspace/use-members";
import { useProjects } from "@/hooks/project/use-projects";
import {
  useCreateTeamspace,
  useSetTeamspaceContents,
  useUpdateTeamspace,
} from "@/hooks/teamspace/use-teamspaces";
import { APIError } from "@/services/api-error";
import type { ITeamspace } from "@/types";
import { cn } from "@/lib/utils";

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function Selectable({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {active ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-primary" /> : null}
      {children}
    </button>
  );
}

interface IProps {
  workspaceSlug: string;
  teamspace?: ITeamspace;
  /** Controlled open (edit from the overview). Omit for trigger mode. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

export function CreateTeamspaceDialog({
  workspaceSlug,
  teamspace,
  open,
  onOpenChange,
  children,
}: IProps) {
  const router = useRouter();
  const isEdit = Boolean(teamspace);
  const { data: members } = useMembers(workspaceSlug);
  const { data: projects } = useProjects(workspaceSlug);
  const create = useCreateTeamspace(workspaceSlug);
  const update = useUpdateTeamspace(workspaceSlug, teamspace?.id ?? "");
  const setContents = useSetTeamspaceContents(workspaceSlug, teamspace?.id ?? "");

  const [name, setName] = useState(() => teamspace?.name ?? "");
  const [description, setDescription] = useState(() => teamspace?.description ?? "");
  const [memberIds, setMemberIds] = useState<Set<string>>(() => new Set(teamspace?.member_ids ?? []));
  const [projectIds, setProjectIds] = useState<Set<string>>(() => new Set(teamspace?.project_ids ?? []));
  const [error, setError] = useState<string | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);

  const controlled = onOpenChange !== undefined;
  const isOpen = controlled ? open : internalOpen;
  const setOpen = controlled ? onOpenChange : setInternalOpen;

  const pending = create.isPending || update.isPending || setContents.isPending;

  const close = () => setOpen(false);

  const submit = () => {
    if (!name.trim()) return;
    setError(null);
    const onErr = (e: unknown) =>
      setError(e instanceof APIError && e.status === 402
        ? "Teamspaces is a Pro feature — upgrade to create one."
        : "Something went wrong. Please try again.");

    if (isEdit && teamspace) {
      update.mutate(
        { name: name.trim(), description: description.trim() },
        {
          onSuccess: () =>
            setContents.mutate(
              { memberIds: [...memberIds], projectIds: [...projectIds] },
              { onSuccess: close, onError: onErr },
            ),
          onError: onErr,
        },
      );
    } else {
      create.mutate(
        {
          name: name.trim(),
          description: description.trim(),
          member_ids: [...memberIds],
          project_ids: [...projectIds],
        },
        {
          onSuccess: (created) => {
            close();
            router.push(`/${workspaceSlug}/teamspaces/${created.id}`);
          },
          onError: onErr,
        },
      );
    }
  };

  const body = (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit teamspace" : "New teamspace"}</DialogTitle>
        <DialogDescription>
          Group members and projects for a shared home, workload and roadmap.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name — e.g. Payments Team"
          aria-label="Teamspace name"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this team own? (optional)"
          aria-label="Teamspace description"
        />

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Members</p>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {(members ?? []).map((m) => (
              <Selectable
                key={m.id}
                active={memberIds.has(m.user_id)}
                onClick={() => setMemberIds((s) => toggle(s, m.user_id))}
              >
                {m.display_name}
              </Selectable>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Projects</p>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {(projects ?? []).map((p) => (
              <Selectable
                key={p.id}
                active={projectIds.has(p.id)}
                onClick={() => setProjectIds((s) => toggle(s, p.id))}
              >
                {p.name}
              </Selectable>
            ))}
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={close} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!name.trim() || pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create teamspace"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      {body}
    </Dialog>
  );
}
