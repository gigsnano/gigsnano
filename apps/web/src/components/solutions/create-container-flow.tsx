"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  Cancel01Icon,
  FolderAddIcon,
} from "@hugeicons/core-free-icons";

import { CreateProjectForm } from "@/components/projects/create-project-form";
import { SOLUTION_CHOOSER_COPY, solutionPresentation } from "@/constants/solutions";
import {
  useCreateSetupDraft,
  useDeleteSetupDraft,
  useSetupDrafts,
  useSolutions,
  useUpdateSetupDraft,
} from "@/hooks/solution/use-solutions";
import { INTAKE_CATALOGUE, intakeForSolution } from "@/lib/solutions/intake";
import { findSolution, recommendedStartingPoint } from "@/lib/solutions/registry";
import {
  ECreateStep,
  SETUP_DRAFT_STEP,
  canResumeDraft,
  flowForStartingPoint,
  resumeStep,
} from "@/lib/solutions/setup-flow";
import { draftFromValues, softwareDeliveryValues } from "@/lib/solutions/setup-values";
import { SOLUTIONS_ENABLED } from "@/lib/solutions/solutions-flag";
import type { ICreateProjectDraft } from "@/lib/projects/create-project-draft";
import { ESolutionKey, type ISetupDraft, type ISolutionDefinition } from "@/types";

/** Long enough to coalesce typing, short enough that closing loses nothing. */
const AUTOSAVE_DELAY = 600;

import { AdaptiveSetupWizard } from "./adaptive-setup-wizard";
import { SolutionChooser } from "./solution-chooser";

/**
 * The global create flow (GIN-446): choose an outcome, then set it up.
 *
 * This is the single entry point for creating anything — every "New project"
 * trigger mounts it, so the chooser can't be bypassed by using a different
 * button. Opening it creates nothing; a setup draft appears only once a solution
 * is selected, and the container only on submit.
 *
 * When `SOLUTIONS_ENABLED` is false (GIN-445 rollback), the chooser is skipped
 * and the legacy Software Delivery form opens directly.
 */
export function CreateContainerFlow({
  workspaceSlug,
  open,
  onOpenChange,
  children,
  initialDraft,
}: {
  workspaceSlug: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  /**
   * Resuming the Software Delivery form after the GitHub OAuth redirect. Skips
   * the chooser, since the user already made that choice before leaving.
   */
  initialDraft?: ICreateProjectDraft | null;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const actualOpen = isControlled ? open : internalOpen;
  const setOpen = isControlled ? onOpenChange! : setInternalOpen;

  const router = useRouter();

  // Rollback / cohort-off: skip the chooser entirely (GIN-445).
  const skipChooser = !SOLUTIONS_ENABLED || Boolean(initialDraft);

  const [step, setStep] = useState<ECreateStep>(
    skipChooser ? ECreateStep.Setup : ECreateStep.Solution,
  );
  const [solutionKey, setSolutionKey] = useState<ESolutionKey>(ESolutionKey.SoftwareDelivery);
  const [startingPoint, setStartingPoint] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [resumedValues, setResumedValues] = useState<ICreateProjectDraft | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Blank project: no solution, no setup draft — just name/code and create.
  const [blank, setBlank] = useState(false);

  const solutions = useSolutions(workspaceSlug);
  const drafts = useSetupDrafts(workspaceSlug);
  const createDraft = useCreateSetupDraft(workspaceSlug);
  const updateDraft = useUpdateSetupDraft(workspaceSlug);
  const deleteDraft = useDeleteSetupDraft(workspaceSlug);

  const registry = solutions.data;
  const activeSolution = registry ? findSolution(registry, solutionKey) : null;

  /**
   * Autosave bookkeeping. Refs rather than state: a keystroke must not re-render
   * the form, and the pending write has to survive the render it was queued in.
   * `revision` is the optimistic-concurrency token from the last write the server
   * accepted — sending a stale one is a 409, so only one write may be in flight.
   */
  const saveTarget = useRef<{ id: string; revision: number } | null>(null);
  const pendingValues = useRef<Record<string, unknown> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saving = useRef(false);

  const scheduleSave = (delay: number) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveNow, delay);
  };

  const saveNow = () => {
    clearTimeout(saveTimer.current);
    const target = saveTarget.current;
    const values = pendingValues.current;
    if (!target || !values) return;
    // Wait for the in-flight write to return the next revision instead of
    // racing it with a token we already spent.
    if (saving.current) {
      scheduleSave(120);
      return;
    }
    pendingValues.current = null;
    saving.current = true;
    updateDraft.mutate(
      { draftId: target.id, step: SETUP_DRAFT_STEP, values, revision: target.revision },
      {
        onSuccess: (saved) => {
          saveTarget.current = { id: saved.id, revision: saved.revision };
          setSaveError(null);
        },
        onError: (error) => {
          setSaveError(
            error instanceof Error
              ? error.message
              : "We couldn't save your progress. Your answers are still here — try again.",
          );
        },
        onSettled: () => {
          saving.current = false;
          if (pendingValues.current) scheduleSave(0);
        },
      },
    );
  };

  const discardPendingSave = () => {
    clearTimeout(saveTimer.current);
    pendingValues.current = null;
  };

  useEffect(() => discardPendingSave, []);

  const resetFlow = () => {
    setStep(skipChooser ? ECreateStep.Setup : ECreateStep.Solution);
    setSolutionKey(ESolutionKey.SoftwareDelivery);
    setStartingPoint(null);
    setDraftId(null);
    setResumedValues(null);
    setSelectError(null);
    setSaveError(null);
    setBlank(false);
    saveTarget.current = null;
  };

  const handleOpenChange = (next: boolean) => {
    // Closing is the most likely way to leave mid-sentence, so flush rather than
    // let the debounce window swallow the last keystrokes.
    if (!next) saveNow();
    setOpen(next);
    // The draft deliberately survives closing — that is what makes the flow
    // resumable. Only the in-memory step resets.
    if (!next) resetFlow();
  };

  const selectSolution = (solution: ISolutionDefinition) => {
    setSelectError(null);
    const recommended = recommendedStartingPoint(solution);
    createDraft.mutate(
      { solution_key: solution.key, starting_point: recommended?.key ?? null },
      {
        onSuccess: (draft) => {
          setBlank(false);
          setSolutionKey(draft.solution_key);
          setStartingPoint(draft.starting_point);
          setDraftId(draft.id);
          setResumedValues(null);
          setSaveError(null);
          saveTarget.current = { id: draft.id, revision: draft.revision };
          setStep(ECreateStep.Setup);
        },
        onError: (error) => {
          // The server re-checks selectability, so a solution disabled since the
          // registry was cached lands here instead of starting a dead setup.
          setSelectError(
            error instanceof Error
              ? error.message
              : "That solution can't be started in this workspace.",
          );
        },
      },
    );
  };

  const resumeDraft = (draft: ISetupDraft) => {
    const solution = registry ? findSolution(registry, draft.solution_key) : null;
    if (!canResumeDraft(draft, solution)) return;
    discardPendingSave();
    setBlank(false);
    setSolutionKey(draft.solution_key);
    setStartingPoint(draft.starting_point);
    setDraftId(draft.id);
    // The answers, not just the step — resuming into an empty form would be a
    // draft in name only.
    setResumedValues(draftFromValues(draft.values, flowForStartingPoint(draft.starting_point)));
    setSaveError(null);
    saveTarget.current = { id: draft.id, revision: draft.revision };
    setStep(resumeStep(draft, solution));
  };

  const selectBlank = () => {
    // Detach from any draft the user backed out of: flush its pending answers,
    // and make sure creating a blank project can't delete it in `onCreated`.
    saveNow();
    saveTarget.current = null;
    setDraftId(null);
    setSelectError(null);
    setBlank(true);
    setStep(ECreateStep.Setup);
  };

  const onCreated = ({
    projectId,
    sprintZeroCycleId,
  }: {
    projectId: string;
    sprintZeroCycleId: string | null;
  }) => {
    // The draft did its job; drop it so it can't be resumed into a container
    // that already exists — and cancel any queued autosave so a PATCH can't
    // land after the DELETE.
    discardPendingSave();
    if (draftId) deleteDraft.mutate(draftId);
    handleOpenChange(false);
    router.push(
      sprintZeroCycleId
        ? `/${workspaceSlug}/projects/${projectId}/cycles/${sprintZeroCycleId}`
        : `/${workspaceSlug}/projects/${projectId}`,
    );
  };

  const onChooser = step === ECreateStep.Solution;
  const presentation = solutionPresentation(solutionKey);
  const solutionIcon = blank ? FolderAddIcon : presentation.icon;
  const tile = blank ? "bg-muted text-muted-foreground" : presentation.tile;

  // Which setup body renders decides the dialog's width, so resolve it before
  // the JSX: the adaptive wizard is three columns (step rail · form · live
  // summary) and needs the wide dialog, while the legacy single-column form
  // reads better narrow.
  const intake = intakeForSolution(INTAKE_CATALOGUE, solutionKey);
  const point =
    startingPoint ??
    (activeSolution ? recommendedStartingPoint(activeSolution)?.key : null) ??
    Object.keys(intake?.starting_points ?? {})[0] ??
    null;
  const onWizard =
    !onChooser && !blank && SOLUTIONS_ENABLED && Boolean(intake) && Boolean(point);

  return (
    <Dialog.Root open={actualOpen} onOpenChange={handleOpenChange}>
      {children ? <Dialog.Trigger asChild>{children}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-backdrop data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-200 data-[state=closed]:duration-150" />
        <Dialog.Content
          className={`gn-dialog-form z-50 flex flex-col overflow-y-auto border bg-background p-6 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:duration-200 data-[state=closed]:duration-150 ease-out ${
            onWizard ? "gn-dialog-form-wide" : ""
          } ${!onChooser && !onWizard && SOLUTIONS_ENABLED ? "md:max-w-3xl" : ""}`}
        >
          {onChooser ? (
            <>
              <Dialog.Title className="text-base font-semibold">
                {SOLUTION_CHOOSER_COPY.title}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">
                {SOLUTION_CHOOSER_COPY.description}
              </Dialog.Description>
            </>
          ) : (
            <>
              {skipChooser ? null : (
                <button
                  type="button"
                  onClick={() => setStep(ECreateStep.Solution)}
                  className="mb-2 -ml-1 flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
                  All outcomes
                </button>
              )}
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                <span
                  className={`flex size-6 items-center justify-center rounded-md ${tile}`}
                  aria-hidden="true"
                >
                  <HugeiconsIcon icon={solutionIcon} className="size-3.5" />
                </span>
                {blank
                  ? "Create a blank project"
                  : `Set up your ${activeSolution?.container_noun ?? "project"}`}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">
                {blank
                  ? "No planning sprint or work items — you add them after it's created."
                  : `${activeSolution?.outcome ?? "Build and operate production-ready software"}. Nothing is created until you submit.`}
              </Dialog.Description>
            </>
          )}

          {/* Keyed so the step change replays the cross-fade (transitions.dev
              #08 / .t-view-swap: 220ms ease-out, reduced-motion guarded). The
              draft id is part of the key so switching drafts remounts the form
              on its own answers instead of keeping the previous draft's. */}
          <div key={`${step}:${blank ? "blank" : (draftId ?? "new")}`} className="t-view-swap mt-4">
            {onChooser ? (
              <SolutionChooser
                registry={registry}
                drafts={drafts.data ?? []}
                isLoading={solutions.isLoading || createDraft.isPending}
                error={solutions.error}
                onSelect={selectSolution}
                onSelectBlank={selectBlank}
                onResumeDraft={resumeDraft}
                onDiscardDraft={(draft) => deleteDraft.mutate(draft.id)}
                discardingDraftId={deleteDraft.isPending ? (deleteDraft.variables ?? null) : null}
                selectError={selectError}
              />
            ) : (() => {
              if (blank) {
                return (
                  <CreateProjectForm
                    workspaceSlug={workspaceSlug}
                    blank
                    onCancel={() => handleOpenChange(false)}
                    onCreated={onCreated}
                  />
                );
              }

              // Adaptive wizard when solutions are on and we have an intake
              // definition (GIN-450). Legacy single-form path is the rollback.
              if (onWizard && intake && point) {
                return (
                  <AdaptiveSetupWizard
                    workspaceSlug={workspaceSlug}
                    definition={intake}
                    startingPoint={point}
                    containerNoun={activeSolution?.container_noun ?? "project"}
                    setupDraftId={draftId}
                    initialValues={undefined}
                    initialProjectDraft={initialDraft ?? resumedValues}
                    saveError={saveError}
                    onCancel={() => handleOpenChange(false)}
                    onCreated={onCreated}
                    onValuesChange={(values) => {
                      // Written from the child's change callback, never during render.
                      // oxlint-disable-next-line react-hooks-js/refs
                      pendingValues.current = values;
                      scheduleSave(AUTOSAVE_DELAY);
                    }}
                  />
                );
              }

              if (solutionKey === ESolutionKey.SoftwareDelivery) {
                return (
                  <>
                    {saveError ? (
                      <p
                        role="alert"
                        className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                      >
                        <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
                        {saveError}
                      </p>
                    ) : null}
                    <CreateProjectForm
                      workspaceSlug={workspaceSlug}
                      initialDraft={initialDraft ?? resumedValues}
                      initialFlow={flowForStartingPoint(startingPoint)}
                      onCancel={() => handleOpenChange(false)}
                      onCreated={onCreated}
                      onDraftChange={(next) => {
                        pendingValues.current = softwareDeliveryValues(next);
                        scheduleSave(AUTOSAVE_DELAY);
                      }}
                    />
                  </>
                );
              }

              return <PendingSolutionSetup name={activeSolution?.name ?? "This solution"} />;
            })()}
          </div>

          <Dialog.Close className="absolute right-3 top-3.5 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            <span className="sr-only">Close</span>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Reachable only when a solution has been force-enabled ahead of its guided
 * intake shipping. Says so plainly rather than rendering an empty form.
 */
function PendingSolutionSetup({ name }: { name: string }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {name} is enabled for this workspace, but its guided setup isn&apos;t available yet. Your draft
      is saved — come back to it once setup ships.
    </p>
  );
}
