"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon, SparklesIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RichEditor } from "@/components/editor";
import { ChatPaymentNotice } from "@/components/billing/chat-payment-notice";
import { APIError } from "@/services/api-error";
import { imageService } from "@/services/image.service";
import { useProjectMembers } from "@/hooks/project/use-project-members";
import { useProject } from "@/hooks/project/use-projects";
import { useCreateStory } from "@/hooks/story/use-stories";
import { useCreateDraft, useUpdateDraft, useDeleteDraft } from "@/hooks/story/use-drafts";
import { useUploadStoryDocuments } from "@/hooks/docs/use-documents";
import { useGenerateDescription } from "@/hooks/ai/use-generate-description";
import { useProjectFeatureFlags, useProjectEstimates } from "@/hooks/project/use-project-settings";
import { cn } from "@/lib/utils";
import { EStoryPriority, EStoryStatus, EStoryType } from "@/types";
import type { IWorkItemDraftPayload, IWorkItemDraftRecord } from "@/types";

import { TypeField } from "./create/type-field";
import { StatusField } from "./create/status-field";
import { PriorityField } from "./create/priority-field";
import { AssigneeField } from "./create/assignee-field";
import { LabelField } from "./create/label-field";
import { DraftDateField } from "./create/date-field";
import { CycleField } from "./create/cycle-field";
import { ModuleField } from "./create/module-field";
import { EstimateField } from "./create/estimate-field";
import { SizeField } from "./create/size-field";
import { DurationField } from "./create/duration-field";
import { ParentField } from "./create/parent-field";
import { AttachmentsField, type IPendingAttachment } from "./create/attachments-field";

// The create-form state doubles as the draft persistence payload — one shared
// shape (`IWorkItemDraftPayload`) so the modal and the drafts backend never drift.
type IWorkItemDraft = IWorkItemDraftPayload;

/** True if the editor HTML holds real content — text OR an image/embed. A plain
 * strip-tags check misses `<img>`, which is exactly what GIN-39 dropped. */
function hasEditorContent(html: string): boolean {
  if (/<(img|video|iframe)\b/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

function makeDefaultDraft(
  cycleId?: string,
  moduleId?: string,
  parentId?: string | null,
): IWorkItemDraft {
  return {
    title: "",
    description: "",
    type: EStoryType.Story,
    status: EStoryStatus.Todo,
    priority: EStoryPriority.None,
    assignee_id: null,
    label_ids: [],
    start_date: null,
    target_date: null,
    cycle_id: cycleId ?? null,
    module_id: moduleId ?? null,
    estimate_id: null,
    estimate_points: null,
    size: null,
    duration_minutes: null,
    parent_id: parentId ?? null,
  };
}

export function CreateWorkItemModal({
  workspaceSlug,
  projectId,
  cycleId,
  moduleId,
  children,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  defaultParentId,
  childTypes,
  resumeDraft,
  initialDraft,
}: {
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  moduleId?: string;
  children?: ReactNode;
  /** Controlled open state — omit `children` to use as a headless dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Pre-fill parent when opened (e.g. sub-work item from detail). */
  defaultParentId?: string | null;
  /** Restrict the type picker to these types — hierarchy-valid child types in
   *  child mode (GIN-317). Omit to allow every type. */
  childTypes?: EStoryType[];
  /** Resume a previously saved draft — seeds the form and routes publish/discard through it. */
  resumeDraft?: IWorkItemDraftRecord;
  /** One-shot field prefill (e.g. from an AI-proposed story) — unlike `resumeDraft`, doesn't wire draft delete-on-save. */
  initialDraft?: Partial<IWorkItemDraft>;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChangeProp?.(next);
    else setInternalOpen(next);
  };

  const [draft, setDraft] = useState<IWorkItemDraft>(
    () =>
      resumeDraft?.payload ??
      { ...makeDefaultDraft(cycleId, moduleId, defaultParentId), ...initialDraft },
  );
  const [editorKey, setEditorKey] = useState(0);
  const [createMore, setCreateMore] = useState(false);
  const [attachments, setAttachments] = useState<IPendingAttachment[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);
  const createDraft = useCreateDraft(workspaceSlug, projectId);
  const updateDraft = useUpdateDraft(workspaceSlug);
  const deleteDraft = useDeleteDraft(workspaceSlug);
  const [resumingId, setResumingId] = useState<string | null>(resumeDraft?.id ?? null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const hasContent = () =>
    draft.title.trim().length > 0 || draft.description.replace(/<[^>]*>/g, "").trim().length > 0;
  const draftPayload = (): IWorkItemDraft => ({ ...draft });

  const { data: project } = useProject(workspaceSlug, projectId);
  const { data: projectMembers } = useProjectMembers(workspaceSlug, projectId);
  const mentionMembers = (projectMembers ?? []).map((m) => ({
    user_id: m.user_id,
    display_name: m.display_name,
    avatar_url: m.avatar_url,
  }));
  const create = useCreateStory(workspaceSlug, projectId, cycleId, moduleId);
  const uploadDocs = useUploadStoryDocuments(workspaceSlug, projectId);
  const gen = useGenerateDescription(workspaceSlug);
  const { cycles: cyclesEnabled, modules: modulesEnabled } = useProjectFeatureFlags(
    workspaceSlug,
    projectId,
  );
  const { data: estimates } = useProjectEstimates(workspaceSlug, projectId);
  // Point estimates only in Points mode (GIN-331) — Automatic/Simple/Time don't
  // capture points on create.
  const estimatesEnabled =
    project?.planning_method === "points" && (estimates ?? []).length > 0;
  // Per-method create fields (GIN-331): each planning method shows its own control.
  const sizeEnabled = project?.planning_method === "simple";
  const durationEnabled = project?.planning_method === "time";

  const set = <K extends keyof IWorkItemDraft>(key: K, value: IWorkItemDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Reset the draft. `preserveContext` keeps `type` + the cycle/module the
  // modal was opened with — used by "Create more" so a rapid-entry burst of
  // items doesn't lose the type/context the user is currently working in.
  const resetDraft = (preserveContext: boolean) => {
    const next = makeDefaultDraft(cycleId, moduleId, defaultParentId ?? null);
    if (preserveContext) {
      next.type = draft.type;
      next.cycle_id = draft.cycle_id;
      next.module_id = draft.module_id;
      next.parent_id = defaultParentId ?? draft.parent_id;
    }
    setDraft(next);
    setEditorKey((k) => k + 1);
  };

  // Reset the draft when the modal transitions closed → open. Adjusted during
  // render via a prev-prop comparison (not an effect) so the fresh draft is
  // committed in the same pass the modal opens — no stale intermediate frame.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft((d) =>
        resumeDraft
          ? resumeDraft.payload
          : {
              ...makeDefaultDraft(cycleId, moduleId, defaultParentId ?? null),
              type: d.type,
              ...initialDraft,
            },
      );
      setResumingId(resumeDraft?.id ?? null);
      setAttachments([]);
      setEditorKey((k) => k + 1);
    }
  }

  // Focus the title input on open — a DOM side effect, so it stays in an effect.
  useEffect(() => {
    if (open) requestAnimationFrame(() => titleRef.current?.focus());
  }, [open]);

  // Radix requests close (X button; Escape/outside-click are prevented below
  // so unsaved work is never lost by an accidental dismiss).
  const requestClose = () => {
    if (hasContent()) {
      setConfirmDiscard(true);
      return;
    }
    finishClose();
  };
  const finishClose = () => {
    setConfirmDiscard(false);
    setOpen(false);
    resetDraft(false);
    setAttachments([]);
    setResumingId(null);
  };

  const saveAsDraft = async () => {
    const payload = { title: draft.title.trim() || "Untitled", payload: draftPayload() };
    if (resumingId) await updateDraft.mutateAsync({ draftId: resumingId, payload });
    else await createDraft.mutateAsync(payload);
    finishClose();
  };
  const discardDraft = async () => {
    if (resumingId) await deleteDraft.mutateAsync(resumingId); // drop the persisted draft too
    finishClose();
  };

  const onSave = async () => {
    if (!draft.title.trim() || create.isPending) return;
    const created = await create.mutateAsync({ ...draft, title: draft.title.trim() });
    // Upload any staged documents to the freshly-created story (GIN-79) — its id
    // only exists now. Uploads are independent, so run them together.
    if (created?.id && attachments.length > 0) {
      await Promise.all(
        attachments.map((a) =>
          uploadDocs.mutateAsync({
            storyId: created.id,
            payload: {
              title: a.title,
              project_id: projectId,
              story_id: created.id,
              file_name: a.file_name,
              mime_type: a.mime_type,
              content: a.content,
            },
          }),
        ),
      );
    }
    setAttachments([]);
    if (createMore) {
      resetDraft(true);
      requestAnimationFrame(() => titleRef.current?.focus());
    } else {
      if (resumingId) {
        await deleteDraft.mutateAsync(resumingId);
        setResumingId(null);
      }
      setOpen(false);
      resetDraft(false);
    }
  };

  const onGenerate = () => {
    if (!draft.title.trim() || gen.isPending) return;
    // Feed any pasted notes into the prompt so the AI builds on them.
    const notes = draft.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    gen.mutate(
      {
        prompt: notes ? `${draft.title}\n\n${notes}` : draft.title,
        task: "Generate a description for this work item.",
        project_id: projectId,
      },
      {
        onSuccess: (r) => {
          // Preserve pasted content — especially images, which strip-tag checks
          // miss — by appending the generated HTML instead of overwriting it
          // (GIN-39). Only replace when the box is effectively empty.
          setDraft((d) => ({
            ...d,
            description: hasEditorContent(d.description)
              ? `${d.description}${r.response_html}`
              : r.response_html,
          }));
          setEditorKey((k) => k + 1);
        },
      },
    );
  };

  const saveDisabled = !draft.title.trim() || create.isPending || uploadDocs.isPending;
  const genDisabled = !draft.title.trim() || gen.isPending;
  const genPaymentBlocked = gen.error instanceof APIError && gen.error.status === 402;
  const genError = Boolean(gen.error) && !genPaymentBlocked;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
        else setOpen(true);
      }}
    >
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent
        size="form"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogDescription className="sr-only">
          Create a new work item in this project.
        </DialogDescription>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Header + title */}
          <div className="gn-dialog-form-pad">
            <DialogTitle className="text-base font-medium tracking-tight text-foreground">
              Create new work item
            </DialogTitle>
            <div className="flex items-center gap-1.5 pt-3 pb-4">
              <span className="gn-dialog-form-chip inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border border-border bg-transparent px-2 text-xs font-medium text-muted-foreground">
                <HugeiconsIcon icon={Folder01Icon} className="size-3.5 shrink-0" />
                <span className="truncate">{project?.name ?? "Project"}</span>
              </span>
              <TypeField
                value={draft.type}
                onChange={(t) => set("type", t)}
                allowedTypes={childTypes}
              />
            </div>
            <Input
              ref={titleRef}
              autoFocus
              aria-label="Work item title"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Title"
              className="h-10 shadow-none"
            />
          </div>

          {/* Description — bordered box with AI tucked in the corner (Plane). */}
          <div className="px-(--dialog-form-pad-x) pt-3 pb-(--dialog-form-pad-y)">
            <div className="relative overflow-hidden rounded-lg border border-border bg-muted/30">
              {/* Cap the editor height so large text/images scroll internally
                  and the AI button below stays in view (GIN-38). The slash/mention
                  menus use position:fixed, so overflow-auto won't clip them. */}
              <div className="gn-dialog-form-desc max-h-[38vh] overflow-y-auto px-3 pt-3">
                <RichEditor
                  key={editorKey}
                  value={draft.description}
                  onChange={(html) => set("description", html)}
                  mentionMembers={mentionMembers}
                  onUploadImage={(file) => imageService.uploadImage(workspaceSlug, file, projectId)}
                  placeholder="Click to add description"
                />
              </div>
              <div className="flex items-center justify-end gap-2 p-2.5">
                <button
                  type="button"
                  disabled={genDisabled}
                  onClick={onGenerate}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-1 text-xs text-muted-foreground",
                    "transition-[background-color,color,transform] duration-150 ease-out",
                    "hover:bg-accent hover:text-foreground",
                    "active:scale-[0.97]",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  {gen.isPending ? (
                    <>
                      <span className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
                      AI
                    </>
                  )}
                </button>
              </div>
            </div>
            {genPaymentBlocked ? (
              <div className="pt-2">
                <ChatPaymentNotice workspaceSlug={workspaceSlug} />
              </div>
            ) : genError ? (
              <p className="pt-2 text-xs text-destructive">
                Couldn&apos;t generate a description. Please try again.
              </p>
            ) : null}
          </div>

          {/* Attach documents — staged now, uploaded once the story exists (GIN-79). */}
          <div className="px-(--dialog-form-pad-x) pb-(--dialog-form-pad-y)">
            <AttachmentsField value={attachments} onChange={setAttachments} />
          </div>
        </div>

        {/* Properties + actions */}
        <div className="shrink-0 border-t border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <StatusField value={draft.status} onChange={(v) => set("status", v)} />
            <PriorityField value={draft.priority} onChange={(v) => set("priority", v)} />
            <AssigneeField
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              value={draft.assignee_id}
              onChange={(v) => set("assignee_id", v)}
            />
            <LabelField
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              value={draft.label_ids}
              onChange={(v) => set("label_ids", v)}
            />
            <DraftDateField
              label="Start date"
              value={draft.start_date}
              onChange={(v) => set("start_date", v)}
            />
            <DraftDateField
              label="Due date"
              value={draft.target_date}
              onChange={(v) => set("target_date", v)}
            />
            {cyclesEnabled ? (
              <CycleField
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                value={draft.cycle_id}
                onChange={(v) => set("cycle_id", v)}
              />
            ) : null}
            {modulesEnabled ? (
              <ModuleField
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                value={draft.module_id}
                onChange={(v) => set("module_id", v)}
              />
            ) : null}
            {estimatesEnabled ? (
              <EstimateField
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                value={{ estimateId: draft.estimate_id, points: draft.estimate_points }}
                onChange={(estimateId, points) => {
                  setDraft((d) => ({ ...d, estimate_id: estimateId, estimate_points: points }));
                }}
              />
            ) : null}
            {sizeEnabled ? (
              <SizeField
                value={draft.size ?? null}
                onChange={(size) => setDraft((d) => ({ ...d, size }))}
              />
            ) : null}
            {durationEnabled ? (
              <DurationField
                value={draft.duration_minutes ?? null}
                onChange={(duration_minutes) => setDraft((d) => ({ ...d, duration_minutes }))}
              />
            ) : null}
            <ParentField
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              value={draft.parent_id}
              onChange={(v) => set("parent_id", v)}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground select-none">
              <Switch
                checked={createMore}
                onCheckedChange={setCreateMore}
                className="h-4 w-7 px-0.5 [&_span]:size-3 data-[state=checked]:[&_span]:translate-x-3"
                aria-label="Create more"
              />
              Create more
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={requestClose}
                className="rounded-md transition-transform duration-150 ease-out active:scale-[0.98]"
              >
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saveDisabled}
                onClick={onSave}
                className="rounded-md transition-transform duration-150 ease-out active:scale-[0.98]"
              >
                {create.isPending || uploadDocs.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>

        {confirmDiscard ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-72 rounded-lg border bg-card p-4 shadow-dialog">
              <p className="text-sm font-medium">Save this as a draft?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                You can resume it later from Drafts.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={discardDraft}
                  disabled={deleteDraft.isPending}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={saveAsDraft}
                  disabled={createDraft.isPending || updateDraft.isPending}
                >
                  Save draft
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
