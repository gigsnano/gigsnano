"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateDocument } from "@/hooks/docs/use-documents";
import { useProjects } from "@/hooks/project/use-projects";
import { EDocumentKind } from "@/types";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const KIND_OPTIONS: { value: EDocumentKind; label: string }[] = [
  { value: EDocumentKind.Brief, label: "Brief" },
  { value: EDocumentKind.Prd, label: "PRD" },
  { value: EDocumentKind.Architecture, label: "Architecture" },
  { value: EDocumentKind.Ux, label: "UX" },
  { value: EDocumentKind.Epics, label: "Epics" },
  { value: EDocumentKind.Research, label: "Research" },
  { value: EDocumentKind.Other, label: "Other" },
];

export function CreateDocumentDialog({
  workspaceSlug,
  children,
}: {
  workspaceSlug: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [kind, setKind] = useState<EDocumentKind>(EDocumentKind.Other);
  const [content, setContent] = useState("");

  const { data: projects } = useProjects(workspaceSlug);
  const create = useCreateDocument(workspaceSlug);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    const doc = await create.mutateAsync({
      title: title.trim(),
      project_id: projectId,
      kind,
      content: content.trim() || undefined,
    });
    setOpen(false);
    setTitle("");
    setProjectId("");
    setKind(EDocumentKind.Other);
    setContent("");
    router.push(`/${workspaceSlug}/docs/${doc.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button type="button" size="sm">
            New document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>New document</DialogTitle>
        <DialogDescription>
          Add a planning artifact manually — Sprint-0 steps also generate docs automatically.
        </DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Product brief draft"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Project
            <select
              required
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={field}
            >
              <option value="">Select project…</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Kind
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as EDocumentKind)}
              className={field}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Content (optional)
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder={"# Title\n\n## Section\n\n- Bullet point"}
              className={field + " min-h-[6rem] py-2"}
            />
          </label>
          <Button type="submit" disabled={create.isPending || !projectId}>
            {create.isPending ? "Creating…" : "Create document"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
