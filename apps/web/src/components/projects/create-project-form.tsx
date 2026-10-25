"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, SparklesIcon, Folder01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { deriveIdentifier } from "@/lib/projects/project-identifier";
import { useCreateProject } from "@/hooks/project/use-projects";
import { imageService } from "@/services/image.service";
import { cn } from "@/lib/utils";
import { EProjectFlow } from "@/types";
import { PROJECT_COVER_GALLERY, DEFAULT_PROJECT_COVER, PROJECT_EMOJI_PALETTE } from "@/constants/project-gallery";
import {
  type ICreateProjectDraft,
  makeEmptyDraft,
  saveCreateProjectDraft,
} from "@/lib/projects/create-project-draft";

import { RepoPicker } from "./github/repo-picker";

/**
 * The Software Delivery setup form. Presentation only — the surrounding dialog
 * (and, since GIN-446, the solution chooser that precedes it) owns opening,
 * closing and where to navigate afterwards.
 */

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";


const FLOWS = [
  { value: EProjectFlow.Fresh, label: "Fresh project", hint: "Greenfield — start from an idea", icon: SparklesIcon },
  { value: EProjectFlow.Existing, label: "Document existing", hint: "Brownfield — an existing codebase", icon: Folder01Icon },
];

export function CreateProjectForm({
  workspaceSlug,
  initialDraft,
  initialFlow,
  onCancel,
  onCreated,
  onDraftChange,
  /**
   * When set, the primary button continues the adaptive wizard instead of
   * creating the project (GIN-450). Creation happens on the intake `create` step.
   */
  onContinue,
  hideFlowPicker = false,
  blank = false,
}: {
  workspaceSlug: string;
  /** Seed the form (e.g. resuming a setup draft). Read at mount. */
  initialDraft?: ICreateProjectDraft | null;
  /** Preselect the flow from the chosen starting point. `initialDraft` wins. */
  initialFlow?: EProjectFlow;
  onCancel: () => void;
  onCreated: (result: { projectId: string; sprintZeroCycleId: string | null }) => void;
  /**
   * Every edit, so the owner can persist it (the setup draft's autosave). Called
   * on change rather than on an interval — debouncing is the owner's business.
   */
  onDraftChange?: (draft: ICreateProjectDraft) => void;
  onContinue?: (draft: ICreateProjectDraft) => void;
  /** Hide Fresh/Existing when the starting point already locked the path. */
  hideFlowPicker?: boolean;
  /**
   * Blank project: only the container — no Sprint-0 or seeded work items, so the
   * delivery-only questions (flow, repo, UI) are hidden.
   */
  blank?: boolean;
}) {
  const create = useCreateProject(workspaceSlug);

  // One object rather than a state per field: the form's whole value *is* the
  // draft, so both the GitHub-redirect stash and the setup-draft autosave read
  // the same snapshot instead of re-listing the fields.
  const [draft, setDraft] = useState<ICreateProjectDraft>(() => ({
    ...makeEmptyDraft(initialFlow),
    ...initialDraft,
  }));
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // Merging from a ref, not from the rendered value, so the logo upload's
  // `.then()` can't resurrect the state as it was when the upload started.
  const latest = useRef(draft);

  const { name, identifier, idEdited, description, flow, hasUi, coverUrl, emoji, logoImageUrl, repoFullName } = draft;

  const patch = (next: Partial<ICreateProjectDraft>) => {
    const merged = { ...latest.current, ...next };
    latest.current = merged;
    setDraft(merged);
    onDraftChange?.(merged);
  };

  const uploadLogo = (file: File | undefined) => {
    if (!file) return;
    setUploadingLogo(true);
    imageService
      .uploadImage(workspaceSlug, file)
      .then((url) => patch({ logoImageUrl: url }))
      .catch(() => {})
      .finally(() => setUploadingLogo(false));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (onContinue) {
      onContinue(latest.current);
      return;
    }
    // The failure (e.g. a taken project code) renders from `create.error` below.
    create
      .mutateAsync({
        name: name.trim(),
        identifier: (idEdited ? identifier : deriveIdentifier(name)) || "PRJ",
        description: description.trim(),
        flow: blank ? EProjectFlow.Fresh : flow,
        has_ui: blank ? false : hasUi,
        cover_image_url: coverUrl,
        logo_emoji: emoji,
        logo_color: null,
        logo_image_url: logoImageUrl,
        repo_full_name: !blank && flow === EProjectFlow.Existing ? repoFullName : null,
        blank,
      })
      .then(({ project, sprintZeroCycleId }) =>
        onCreated({ projectId: project.id, sprintZeroCycleId }),
      )
      .catch(() => {});
  };

  return (
    <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
      {/* Cover preview + emoji badge */}
      <div className="relative rounded-lg border">
        <div className="relative h-24 overflow-hidden rounded-lg">
          <Image src={coverUrl} alt="" fill sizes="480px" className="object-cover" />
        </div>
        <span className="absolute -bottom-3 left-3 flex size-9 items-center justify-center rounded-md border bg-card text-base shadow-sm">
          {emoji}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Cover</span>
        <div className="grid grid-cols-6 gap-1.5">
          {PROJECT_COVER_GALLERY.map((cover) => (
            <button
              key={cover.id}
              type="button"
              onClick={() => patch({ coverUrl: cover.url })}
              aria-label={cover.alt}
              className={cn(
                "relative aspect-video overflow-hidden rounded-md border transition-all",
                coverUrl === cover.url
                  ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                  : "hover:opacity-80",
              )}
            >
              <Image src={cover.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Icon</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {logoImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoImageUrl} alt="" className="size-8 rounded-md border object-cover" />
          ) : null}
          {PROJECT_EMOJI_PALETTE.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`Select ${e} emoji`}
              onClick={() => patch({ emoji: e, logoImageUrl: null })}
              className={cn(
                "flex size-8 items-center justify-center rounded-md border text-base transition-colors",
                emoji === e && !logoImageUrl
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-accent/50",
              )}
            >
              {e}
            </button>
          ))}
          <label
            className={cn(
              "flex h-8 cursor-pointer items-center rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-accent/50 active:scale-[0.98]",
              uploadingLogo && "pointer-events-none opacity-60",
            )}
          >
            {uploadingLogo ? "Uploading…" : logoImageUrl ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="sr-only"
              disabled={uploadingLogo}
              onChange={(e) => uploadLogo(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
          Name
          <input
            value={name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Mobile Banking App"
            className={field}
          />
        </label>
        <label className="flex w-24 flex-col gap-1.5 text-sm font-medium">
          ID
          <input
            value={idEdited ? identifier : deriveIdentifier(name)}
            onChange={(e) => patch({ idEdited: true, identifier: e.target.value.toUpperCase() })}
            placeholder="MBA"
            className={cn(field, "font-mono uppercase")}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Description
        <textarea
          value={description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="What is this project about?"
          rows={2}
          className={cn(field, "h-auto resize-none py-2")}
        />
      </label>

      {hideFlowPicker || blank ? null : (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">How are you starting?</span>
          <div className="grid grid-cols-2 gap-2">
            {FLOWS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => patch({ flow: f.value })}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                  flow === f.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-accent/50",
                )}
              >
                <HugeiconsIcon icon={f.icon} className="size-4 text-primary" />
                <span className="text-sm font-medium">{f.label}</span>
                <span className="text-xs text-muted-foreground">{f.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!blank && flow === EProjectFlow.Existing ? (
        <RepoPicker
          workspaceSlug={workspaceSlug}
          value={repoFullName}
          onChange={(next) => patch({ repoFullName: next })}
          onBeforeConnect={() => saveCreateProjectDraft(workspaceSlug, draft)}
        />
      ) : null}

      {blank ? null : (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/30">
          <div>
            <span className="text-sm font-medium">Has a user interface?</span>
            <p className="text-xs text-muted-foreground">
              Adds the UX design step to Sprint-0. Turn off for APIs, CLIs, or backend-only work.
            </p>
          </div>
          <input
            type="checkbox"
            checked={hasUi}
            onChange={(e) => patch({ hasUi: e.target.checked })}
            className="size-4 rounded border accent-primary"
          />
        </label>
      )}

      {create.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
          {create.error.message}
        </p>
      ) : null}

      <div className="mt-1 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || (!onContinue && create.isPending)}>
          {onContinue
            ? "Continue"
            : create.isPending
              ? "Creating…"
              : "Create project"}
        </Button>
      </div>
    </form>
  );
}
