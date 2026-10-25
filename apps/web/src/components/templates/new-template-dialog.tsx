"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";

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
import { useCreateTemplate, useDraftTemplate } from "@/hooks/template/use-templates";
import type { ITemplateDraft, TTemplateKind, TTemplateVisibility } from "@/types";
import { cn } from "@/lib/utils";

export function NewTemplateDialog({
  workspaceSlug,
  kind,
  children,
}: {
  workspaceSlug: string;
  kind: TTemplateKind;
  children: React.ReactNode;
}) {
  const create = useCreateTemplate(workspaceSlug);
  const draftM = useDraftTemplate(workspaceSlug);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"blank" | "ai">("blank");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<TTemplateVisibility>("private");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ITemplateDraft | null>(null);

  const aiAllowed = kind === "work_item";

  const reset = () => {
    setMode("blank");
    setName("");
    setVisibility("private");
    setText("");
    setDraft(null);
  };

  const createBlank = () => {
    if (!name.trim()) return;
    create.mutate(
      { kind, name: name.trim(), visibility },
      { onSuccess: () => { setOpen(false); reset(); } },
    );
  };

  const runDraft = () => {
    if (!text.trim()) return;
    draftM.mutate(text.trim(), {
      onSuccess: (d) => {
        setDraft(d);
        setName(d.name);
      },
    });
  };

  const saveDraft = () => {
    if (!draft || !name.trim()) return;
    create.mutate(
      { kind: "work_item", name: name.trim(), visibility, content: draft.content },
      { onSuccess: () => { setOpen(false); reset(); } },
    );
  };

  const checklist = (draft?.content?.checklist as string[] | undefined) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New {kind === "project" ? "project" : "work-item"} template</DialogTitle>
          <DialogDescription>
            Reusable, pre-filled {kind === "project" ? "project scaffolding" : "work items"}.
          </DialogDescription>
        </DialogHeader>

        {aiAllowed ? (
          <div className="inline-flex self-start rounded-lg border bg-muted/40 p-0.5">
            {(["blank", "ai"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {m === "blank" ? "Blank" : "Draft with AI"}
              </button>
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          {mode === "ai" && aiAllowed && !draft ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder='Describe it — e.g. "a weekly status report with wins, blockers, next steps"'
                aria-label="Describe the template"
                className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <Button size="sm" onClick={runDraft} disabled={!text.trim() || draftM.isPending}>
                <HugeiconsIcon icon={SparklesIcon} className="size-4" />
                {draftM.isPending ? "Drafting…" : "Draft"}
              </Button>
            </>
          ) : (
            <>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name"
                aria-label="Template name"
                autoFocus
              />
              {draft && checklist.length ? (
                <div className="rounded-md border bg-muted/30 p-2.5">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Checklist</p>
                  <ul className="list-inside list-disc text-sm text-muted-foreground">
                    {checklist.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Visibility</span>
                {(["private", "public"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors",
                      visibility === v
                        ? "border-primary/40 bg-primary/10"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {mode === "ai" && draft ? (
            <Button onClick={saveDraft} disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Saving…" : "Save template"}
            </Button>
          ) : mode === "blank" ? (
            <Button onClick={createBlank} disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
