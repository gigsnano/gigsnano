"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, Add01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/project/use-projects";
import { useCreateInitiative, useDraftInitiatives } from "@/hooks/roadmap/use-roadmap";
import type { IDraftedInitiative } from "@/types";
import { cn } from "@/lib/utils";

/** Analyst drafts initiatives from a project's brief; add the ones you want. */
export function DraftInitiativesDialog({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: projects } = useProjects(workspaceSlug);
  const draft = useDraftInitiatives(workspaceSlug);
  const create = useCreateInitiative(workspaceSlug);
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<IDraftedInitiative[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const runDraft = (pid: string) => {
    setProjectId(pid);
    draft.mutate(pid, { onSuccess: (r) => setSuggestions(r.initiatives) });
  };

  const reset = () => {
    setProjectId(null);
    setSuggestions([]);
    setAdded(new Set());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <HugeiconsIcon icon={SparklesIcon} className="size-4" />
          Draft with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft initiatives</DialogTitle>
          <DialogDescription>
            The Analyst proposes cross-cutting initiatives from a project&apos;s brief.
          </DialogDescription>
        </DialogHeader>

        {suggestions.length === 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Draft from</p>
            <div className="flex flex-wrap gap-1.5">
              {(projects ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={draft.isPending}
                  onClick={() => runDraft(p.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    projectId === p.id
                      ? "border-primary/40 bg-primary/10"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {draft.isPending ? (
              <p className="mt-3 text-sm text-muted-foreground">Drafting…</p>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {suggestions.map((s) => {
              const isAdded = added.has(s.title);
              return (
                <li key={s.title} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  </div>
                  <Button
                    variant={isAdded ? "ghost" : "outline"}
                    size="sm"
                    disabled={isAdded || create.isPending}
                    onClick={() =>
                      create.mutate(
                        { title: s.title, description: s.description },
                        { onSuccess: () => setAdded((a) => new Set(a).add(s.title)) },
                      )
                    }
                  >
                    <HugeiconsIcon
                      icon={isAdded ? CheckmarkCircle02Icon : Add01Icon}
                      className="size-4"
                    />
                    {isAdded ? "Added" : "Add"}
                  </Button>
                </li>
              );
            })}
            <Button variant="ghost" size="sm" className="self-start" onClick={reset}>
              Draft from another project
            </Button>
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
