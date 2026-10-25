"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateBundle, useUpdateBundle } from "@/hooks/codebase/use-bundles";
import { validateBundleConfig } from "@/lib/codebase/bundle-validation";
import { cn } from "@/lib/utils";
import type { IProjectRepository, ISystemBundle } from "@/types";

import {
  StepConfigure,
  StepDependencies,
  StepDetails,
  StepRepositories,
  StepReview,
  type IWizardState,
} from "./wizard-steps";

const STEP_TITLES = ["Details", "Repositories", "Configure", "Dependencies", "Review"];

export function CreateBundleWizard({
  open,
  onOpenChange,
  workspaceSlug,
  projectId,
  repos,
  editing,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projectId: string;
  repos: IProjectRepository[];
  /** When set, the wizard edits this bundle (creates a new version on save). */
  editing?: ISystemBundle | null;
  /** When set (and not editing), prefill from this bundle but create a new one (Duplicate). */
  template?: ISystemBundle | null;
}) {
  const create = useCreateBundle(workspaceSlug, projectId);
  const updateBundle = useUpdateBundle(workspaceSlug, projectId);

  const [step, setStep] = useState(0);
  const [state, setState] = useState<IWizardState>(() => initialState(editing ?? template));

  const result = validateBundleConfig(state.repos, state.deps);
  const invalidPaths = new Set<string>();
  for (const issue of result.issues) {
    if (
      issue.code === "duplicate_mount_path" ||
      issue.code === "nested_mount_path" ||
      issue.code === "path_traversal"
    ) {
      for (const id of issue.repo_ids) invalidPaths.add(id);
    }
  }
  const repoName = (id: string) => repos.find((r) => r.id === id)?.display_name ?? id;

  function update(patch: Partial<IWizardState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  function reset() {
    setStep(0);
    setState(initialState(editing ?? template));
  }

  function close() {
    onOpenChange(false);
  }

  const busy = create.isPending || updateBundle.isPending;

  function submit(saveAsDraft: boolean) {
    const payload = {
      name: state.name.trim(),
      description: state.description.trim(),
      repositories: state.repos,
      // Strip the client-only `key` before sending.
      dependencies: state.deps.map(({ key, ...d }) => d),
      save_as_draft: saveAsDraft,
    };
    const onDone = { onSuccess: () => close() };
    if (editing) {
      updateBundle.mutate({ bundleId: editing.id, payload }, onDone);
    } else {
      create.mutate(payload, onDone);
    }
  }

  const canAdvance = step === 0 ? state.name.trim().length > 0 : true;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit System Bundle" : "Create System Bundle"}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <ol className="flex items-center gap-1 text-xs">
          {STEP_TITLES.map((title, i) => (
            <li key={title} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors",
                  i === step ? "text-foreground" : "text-muted-foreground",
                  i < step && "hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[11px] font-medium transition-colors",
                    i <= step ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {i + 1}
                </span>
                <span className="hidden sm:inline">{title}</span>
              </button>
              {i < STEP_TITLES.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
            </li>
          ))}
        </ol>

        {/* Step body — keyed so it re-triggers the light enter transition on step change. */}
        <div key={step} className="min-h-[280px] animate-in fade-in-0 slide-in-from-right-1">
          {step === 0 ? <StepDetails state={state} update={update} /> : null}
          {step === 1 ? <StepRepositories state={state} update={update} repos={repos} /> : null}
          {step === 2 ? (
            <StepConfigure state={state} update={update} repoName={repoName} invalidPaths={invalidPaths} />
          ) : null}
          {step === 3 ? <StepDependencies state={state} update={update} repoName={repoName} /> : null}
          {step === 4 ? <StepReview state={state} result={result} repoName={repoName} /> : null}
        </div>

        {editing ? (
          <p className="text-xs text-muted-foreground">
            Saving creates a new immutable version — active runs keep the version they started with.
          </p>
        ) : null}

        {/* Footer */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => submit(true)} disabled={busy || !state.name.trim()}>
            Save draft
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {step > 0 ? (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            ) : null}
            {step < 4 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
                Next
              </Button>
            ) : (
              <Button onClick={() => submit(false)} disabled={busy || !result.valid || state.repos.length === 0}>
                {busy ? "Saving…" : editing ? "Save bundle" : "Create bundle"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function initialState(editing?: ISystemBundle | null): IWizardState {
  if (editing) {
    return {
      name: editing.name,
      description: editing.description,
      repos: structuredClone(editing.latest.repositories),
      deps: editing.latest.dependencies.map((d) => ({ ...structuredClone(d), key: crypto.randomUUID() })),
    };
  }
  return { name: "", description: "", repos: [], deps: [] };
}
