"use client";

import { useId, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  LockIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import { CreateProjectForm } from "@/components/projects/create-project-form";
import { deriveIdentifier } from "@/lib/projects/project-identifier";
import { AnalysisProgressPanel } from "@/components/solutions/analysis-progress-panel";
import { ConnectionAuthorizePanel } from "@/components/solutions/connection-authorize-panel";
import { InstallPlanReview } from "@/components/solutions/install-plan-review";
import { Button } from "@/components/ui/button";
import { useCreateProject } from "@/hooks/project/use-projects";
import type { ICreateProjectDraft } from "@/lib/projects/create-project-draft";
import { makeEmptyDraft } from "@/lib/projects/create-project-draft";
import { softwareDeliveryBlueprint, revenueAssuranceBlueprint } from "@/lib/solutions/blueprint";
import {
  applicableSteps,
  beginStep,
  completeStep,
  deferStep,
  findStep,
  initialIntakeState,
  progressOf,
  resolveStepStatuses,
  startingPointConfig,
} from "@/lib/solutions/intake";
import type { IRecommendationEvidence } from "@/lib/solutions/plan";
import { flowForStartingPoint } from "@/lib/solutions/setup-flow";
import { draftFromValues, softwareDeliveryValues } from "@/lib/solutions/setup-values";
import { cn } from "@/lib/utils";
import {
  EIntakeExecution,
  EIntakeStepStatus,
  EProjectFlow,
  ESolutionKey,
  type IIntakeDefinition,
  type IIntakeState,
  type IIntakeStepDefinition,
  type IInstallPlan,
} from "@/types";

/**
 * Adaptive onboarding wizard (GIN-450).
 *
 * Renders from the intake definition + machine state — never from hardcoded
 * solution branches. Exactly one primary action is emphasized; the sticky
 * summary shows the evolving setup without leaving the flow.
 */

const STATUS_LABEL: Record<EIntakeStepStatus, string> = {
  [EIntakeStepStatus.Locked]: "Locked",
  [EIntakeStepStatus.Available]: "Up next",
  [EIntakeStepStatus.InProgress]: "In progress",
  [EIntakeStepStatus.Complete]: "Done",
  [EIntakeStepStatus.Skipped]: "Skipped",
  [EIntakeStepStatus.Deferred]: "Deferred",
  [EIntakeStepStatus.Waived]: "Waived",
  [EIntakeStepStatus.Invalidated]: "Needs update",
};


export function AdaptiveSetupWizard({
  workspaceSlug,
  definition,
  startingPoint,
  containerNoun,
  setupDraftId = null,
  initialValues,
  initialProjectDraft,
  saveError,
  onCancel,
  onCreated,
  onValuesChange,
}: {
  workspaceSlug: string;
  definition: IIntakeDefinition;
  startingPoint: string;
  containerNoun: string;
  /** Setup draft id — analysis jobs attach to it so they survive navigation. */
  setupDraftId?: string | null;
  /** Persisted setup-draft values (API-shaped). */
  initialValues?: Record<string, unknown>;
  initialProjectDraft?: ICreateProjectDraft | null;
  saveError?: string | null;
  onCancel: () => void;
  onCreated: (result: { projectId: string; sprintZeroCycleId: string | null }) => void;
  onValuesChange?: (values: Record<string, unknown>) => void;
}) {
  const headingId = useId();
  const summaryId = useId();
  const create = useCreateProject(workspaceSlug);

  const [intake, setIntake] = useState<IIntakeState>(() => {
    const seed = {
      starting_point: startingPoint,
      ...(initialValues ?? {}),
    };
    const state = initialIntakeState(definition, startingPoint, seed);
    return beginStep(state, state.current_step ?? "start");
  });

  const [projectDraft, setProjectDraft] = useState<ICreateProjectDraft>(() => {
    if (initialProjectDraft) return initialProjectDraft;
    if (initialValues) {
      return (
        draftFromValues(initialValues, flowForStartingPoint(startingPoint)) ??
        makeEmptyDraft(flowForStartingPoint(startingPoint))
      );
    }
    return makeEmptyDraft(flowForStartingPoint(startingPoint));
  });

  const [stepError, setStepError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(
    () => (typeof initialValues?.analysis_job_id === "string" ? initialValues.analysis_job_id : null),
  );
  const [connectedConnectors, setConnectedConnectors] = useState<string[]>([]);

  const statuses = resolveStepStatuses(definition, intake);
  const progress = progressOf(definition, intake);
  const steps = applicableSteps(definition, intake.starting_point);
  const currentKey = intake.current_step;
  const currentStep = currentKey ? findStep(definition, currentKey) : null;
  const config = startingPointConfig(definition, intake.starting_point);

  const emitValues = (next: IIntakeState, draft?: ICreateProjectDraft) => {
    const merged = {
      ...next.values,
      ...(draft ? softwareDeliveryValues(draft) : {}),
    };
    onValuesChange?.(merged);
  };

  const settle = (stepKey: string, values: Record<string, unknown> = {}) => {
    try {
      setStepError(null);
      const next = completeStep(definition, intake, stepKey, values);
      setIntake(next.current_step ? beginStep(next, next.current_step) : next);
      emitValues(next, projectDraft);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "That step can't be completed yet.");
    }
  };

  const deferCurrent = () => {
    if (!currentKey) return;
    try {
      setStepError(null);
      const next = deferStep(definition, intake, currentKey);
      setIntake(next.current_step ? beginStep(next, next.current_step) : next);
      emitValues(next, projectDraft);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "That step can't be deferred.");
    }
  };

  const goToStep = (stepKey: string) => {
    const status = statuses[stepKey];
    if (
      status !== EIntakeStepStatus.Complete &&
      status !== EIntakeStepStatus.Available &&
      status !== EIntakeStepStatus.InProgress &&
      status !== EIntakeStepStatus.Invalidated &&
      status !== EIntakeStepStatus.Deferred
    ) {
      return;
    }
    setIntake(beginStep(intake, stepKey));
  };

  const onIdentityContinue = (stepKey: string, draft: ICreateProjectDraft) => {
    setProjectDraft(draft);
    settle(stepKey, {
      name: draft.name,
      identifier: draft.identifier,
      description: draft.description,
      has_ui: draft.hasUi,
      repo_full_name: draft.repoFullName,
    });
  };

  const onCreate = async () => {
    if (!projectDraft.name.trim()) {
      setCreateError(`Give the ${containerNoun} a name before creating it.`);
      return;
    }
    setCreateError(null);
    try {
      const { project, sprintZeroCycleId } = await create.mutateAsync({
        name: projectDraft.name.trim(),
        identifier:
          (projectDraft.idEdited
            ? projectDraft.identifier
            : deriveIdentifier(projectDraft.name)) || "PRJ",
        description: projectDraft.description.trim(),
        flow: projectDraft.flow,
        has_ui: projectDraft.hasUi,
        cover_image_url: projectDraft.coverUrl,
        logo_emoji: projectDraft.emoji,
        logo_color: null,
        logo_image_url: projectDraft.logoImageUrl,
        repo_full_name:
          projectDraft.flow === EProjectFlow.Existing ? projectDraft.repoFullName : null,
      });
      onCreated({ projectId: project.id, sprintZeroCycleId });
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : `We couldn't create the ${containerNoun}.`,
      );
    }
  };

  const recommendationEvidence: IRecommendationEvidence = {
    solution_key: definition.solution_key,
    solution_version: 1,
    journey_key: intake.starting_point,
    connected_connectors: connectedConnectors,
    proposal_node_keys: Array.isArray(intake.values.proposal_node_keys)
      ? (intake.values.proposal_node_keys as string[])
      : [],
    decided_parameters: Object.keys(intake.values),
  };

  const liveSummary = {
    name: projectDraft.name.trim() || (intake.values.name as string | undefined) || "Untitled",
    startingPoint: intake.starting_point,
    blueprint:
      definition.solution_key === ESolutionKey.RevenueAssurance
        ? revenueAssuranceBlueprint.identity.name
        : softwareDeliveryBlueprint.identity.name,
    progressLabel: `${progress.completed} of ${progress.total} steps`,
    ratio: progress.ratio,
  };

  return (
    <div className="flex min-h-0 flex-col gap-4 md:flex-row md:gap-6">
      {/* Step rail — desktop; compact progress on mobile */}
      <nav
        aria-label="Setup steps"
        className="hidden w-44 shrink-0 flex-col gap-0.5 md:flex"
      >
        {steps.map((step, index) => (
          <StepRailItem
            key={step.key}
            step={step}
            index={index}
            status={statuses[step.key] ?? EIntakeStepStatus.Locked}
            active={step.key === currentKey}
            onSelect={() => goToStep(step.key)}
          />
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Mobile progress */}
        <div className="md:hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{liveSummary.progressLabel}</span>
            <span>{Math.round(progress.ratio * 100)}%</span>
          </div>
          <div
            className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(progress.ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Setup progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
              style={{ width: `${Math.round(progress.ratio * 100)}%` }}
            />
          </div>
        </div>

        {config?.reduced_automation && config.notice ? (
          <p
            role="status"
            className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          >
            {config.notice}
          </p>
        ) : null}

        {saveError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
            {saveError}
          </p>
        ) : null}

        {stepError || createError ? (
          <p
            role="alert"
            className="t-error flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive is-shaking"
          >
            <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
            {stepError ?? createError}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-col gap-4 lg:flex-row">
          <section
            aria-labelledby={headingId}
            className="t-view-swap min-w-0 flex-1"
            key={currentKey ?? "done"}
          >
            {currentStep ? (
              <>
                <header className="mb-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {currentStep.required ? "Required" : "Optional"} ·{" "}
                    {executionLabel(currentStep.execution)}
                  </p>
                  <h3 id={headingId} className="mt-0.5 text-base font-semibold">
                    {currentStep.label}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{currentStep.description}</p>
                </header>
                <StepBody
                  step={currentStep}
                  workspaceSlug={workspaceSlug}
                  startingPoint={intake.starting_point}
                  projectDraft={projectDraft}
                  containerNoun={containerNoun}
                  setupDraftId={setupDraftId}
                  analysisJobId={analysisJobId}
                  creating={create.isPending}
                  onCancel={onCancel}
                  onDraftChange={(draft) => {
                    setProjectDraft(draft);
                    emitValues(intake, draft);
                  }}
                  onIdentityContinue={onIdentityContinue}
                  onConfirmStart={() => settle("start", { starting_point: startingPoint })}
                  onDefer={currentStep.deferrable ? deferCurrent : undefined}
                  onSkipOptional={() => settle(currentStep.key)}
                  onCreate={onCreate}
                  onAnalysisJobId={(id) => {
                    setAnalysisJobId(id);
                    emitValues(
                      { ...intake, values: { ...intake.values, analysis_job_id: id } },
                      projectDraft,
                    );
                  }}
                  onAnalysisContinue={() =>
                    settle(currentStep.key, { analysis_job_id: analysisJobId })
                  }
                  onConnected={(connectionId, connectorKey) => {
                    setConnectedConnectors((prev) =>
                      prev.includes(connectorKey) ? prev : [...prev, connectorKey],
                    );
                    settle(currentStep.key, {
                      connection_id: connectionId,
                      connector_key: connectorKey,
                    });
                  }}
                  recommendationEvidence={recommendationEvidence}
                  onPlanConfirmed={(plan) =>
                    settle(currentStep.key, {
                      blueprint_key: plan.blueprint_key,
                      blueprint_version: plan.blueprint_version,
                      blueprint_digest: plan.blueprint_digest,
                      planned_items: plan.counts.selected,
                    })
                  }
                />
              </>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Setup is complete. Create the {containerNoun} from the summary, or go back to review
                a step.
              </p>
            )}
          </section>

          {/* Sticky setup summary */}
          <aside
            id={summaryId}
            aria-label="Setup summary"
            className="lg:sticky lg:top-0 lg:w-52 lg:shrink-0 lg:self-start"
          >
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Live setup
              </p>
              <p className="mt-1 truncate text-sm font-semibold">{liveSummary.name}</p>
              <dl className="mt-3 space-y-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Starting point</dt>
                  <dd className="font-medium capitalize">
                    {liveSummary.startingPoint.replaceAll("_", " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Blueprint</dt>
                  <dd className="font-medium leading-snug">{liveSummary.blueprint}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Progress</dt>
                  <dd className="font-medium">{liveSummary.progressLabel}</dd>
                </div>
              </dl>
              <div
                className="mt-3 hidden h-1 overflow-hidden rounded-full bg-muted md:block"
                role="progressbar"
                aria-valuenow={Math.round(progress.ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Setup progress"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                />
              </div>
              {progress.next_action ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Next: <span className="font-medium text-foreground">{progress.next_action.label}</span>
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function executionLabel(execution: EIntakeExecution): string {
  switch (execution) {
    case EIntakeExecution.Form:
      return "Form";
    case EIntakeExecution.Analysis:
      return "Analysis";
    case EIntakeExecution.Connect:
      return "Connect";
    case EIntakeExecution.Review:
      return "Review";
  }
}

function StepRailItem({
  step,
  index,
  status,
  active,
  onSelect,
}: {
  step: IIntakeStepDefinition;
  index: number;
  status: EIntakeStepStatus;
  active: boolean;
  onSelect: () => void;
}) {
  const locked = status === EIntakeStepStatus.Locked || status === EIntakeStepStatus.Skipped;
  const done =
    status === EIntakeStepStatus.Complete ||
    status === EIntakeStepStatus.Waived ||
    status === EIntakeStepStatus.Deferred;

  return (
    <button
      type="button"
      disabled={locked && !done}
      onClick={onSelect}
      aria-current={active ? "step" : undefined}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-150",
        active ? "bg-primary/5 text-foreground" : "text-muted-foreground hover:bg-muted/60",
        locked && !done && "opacity-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold",
          done && "border-primary bg-primary text-primary-foreground",
          active && !done && "border-primary text-primary",
        )}
        aria-hidden="true"
      >
        {done ? (
          <HugeiconsIcon icon={Tick02Icon} className="size-2.5" />
        ) : locked ? (
          <HugeiconsIcon icon={LockIcon} className="size-2.5" />
        ) : (
          index + 1
        )}
      </span>
      <span className="min-w-0">
        {/* Wraps rather than truncates: "Review generated setup" and "Connect
            required integrations" don't fit one rail line, and a step you can't
            read is worse than one that takes two lines. */}
        <span className="block font-medium text-pretty">{step.label}</span>
        <span className="block text-[10px] opacity-80">{STATUS_LABEL[status]}</span>
      </span>
    </button>
  );
}

function StepBody({
  step,
  workspaceSlug,
  startingPoint,
  projectDraft,
  containerNoun,
  setupDraftId,
  analysisJobId,
  creating,
  onCancel,
  onDraftChange,
  onIdentityContinue,
  onConfirmStart,
  onDefer,
  onSkipOptional,
  onCreate,
  onAnalysisJobId,
  onAnalysisContinue,
  onConnected,
  recommendationEvidence,
  onPlanConfirmed,
}: {
  step: IIntakeStepDefinition;
  workspaceSlug: string;
  startingPoint: string;
  projectDraft: ICreateProjectDraft;
  containerNoun: string;
  setupDraftId: string | null;
  analysisJobId: string | null;
  creating: boolean;
  onCancel: () => void;
  onDraftChange: (draft: ICreateProjectDraft) => void;
  onIdentityContinue: (stepKey: string, draft: ICreateProjectDraft) => void;
  onConfirmStart: () => void;
  onDefer?: () => void;
  onSkipOptional: () => void;
  onCreate: () => void;
  onAnalysisJobId: (id: string) => void;
  onAnalysisContinue: () => void;
  onConnected: (connectionId: string, connectorKey: string) => void;
  recommendationEvidence: IRecommendationEvidence;
  onPlanConfirmed: (plan: IInstallPlan) => void;
}) {
  if (step.key === "start") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          Starting from{" "}
          <span className="font-medium capitalize">{startingPoint.replaceAll("_", " ")}</span>. You
          can change this later — we&apos;ll show what would reset.
        </p>
        <PrimaryActions
          onCancel={onCancel}
          primaryLabel="Confirm and continue"
          onPrimary={onConfirmStart}
        />
      </div>
    );
  }

  if (step.key === "context" || step.key === "scope") {
    return (
      <CreateProjectForm
        workspaceSlug={workspaceSlug}
        initialDraft={projectDraft}
        initialFlow={flowForStartingPoint(startingPoint)}
        hideFlowPicker
        onCancel={onCancel}
        onCreated={() => {}}
        onDraftChange={onDraftChange}
        onContinue={(draft) => onIdentityContinue(step.key, draft)}
      />
    );
  }

  if (step.execution === EIntakeExecution.Analysis || step.key === "repository") {
    return (
      <AnalysisProgressPanel
        workspaceSlug={workspaceSlug}
        setupDraftId={setupDraftId}
        jobId={analysisJobId}
        onJobId={onAnalysisJobId}
        onContinue={onAnalysisContinue}
        onCancel={onCancel}
      />
    );
  }

  if (step.execution === EIntakeExecution.Connect) {
    return (
      <ConnectionAuthorizePanel
        workspaceSlug={workspaceSlug}
        onCancel={onCancel}
        onSkip={step.deferrable || !step.required ? onSkipOptional : undefined}
        onConnected={(conn) => onConnected(conn.id, conn.connector_key)}
      />
    );
  }

  if (step.key === "blueprint") {
    return (
      <InstallPlanReview
        evidence={recommendationEvidence}
        workspaceSlug={workspaceSlug}
        setupDraftId={setupDraftId ?? "unsaved"}
        parameters={{}}
        confirmLabel="Use this plan"
        onInstall={onPlanConfirmed}
        onBlank={onSkipOptional}
        onCancel={onCancel}
      />
    );
  }

  if (step.key === "create" || step.key === "review") {
    return (
      <div className="flex flex-col gap-4">
        <ul className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
          <li>
            <span className="text-muted-foreground">Name · </span>
            {projectDraft.name.trim() || "—"}
          </li>
          <li>
            <span className="text-muted-foreground">Identifier · </span>
            <span className="font-mono">
              {projectDraft.idEdited
                ? projectDraft.identifier
                : deriveIdentifier(projectDraft.name) || "—"}
            </span>
          </li>
          <li>
            <span className="text-muted-foreground">Flow · </span>
            {projectDraft.flow === EProjectFlow.Existing ? "Document existing" : "Fresh project"}
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Nothing exists until you create. This is the only irreversible step.
        </p>
        <PrimaryActions
          onCancel={onCancel}
          primaryLabel={creating ? "Creating…" : `Create ${containerNoun}`}
          onPrimary={onCreate}
          primaryDisabled={creating || !projectDraft.name.trim()}
        />
      </div>
    );
  }

  // Definition-driven placeholders for steps whose specialized UI ships later
  // (vision, structure, blueprint, connect, own, repository, …).
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-muted-foreground" />
          {step.label}
        </p>
        <p className="mt-1.5">
          This step is defined by the intake contract. You can{" "}
          {step.deferrable ? "defer it and continue" : "continue"} — answers here will deepen as
          connectors and blueprints ship.
        </p>
        {step.material_inputs.length > 0 ? (
          <p className="mt-2 text-xs">
            Material inputs:{" "}
            <span className="font-mono text-foreground/80">{step.material_inputs.join(", ")}</span>
          </p>
        ) : null}
      </div>
      <PrimaryActions
        onCancel={onCancel}
        primaryLabel={step.required ? "Continue" : "Continue without this"}
        onPrimary={onSkipOptional}
        secondaryLabel={onDefer ? "Defer for later" : undefined}
        onSecondary={onDefer}
      />
    </div>
  );
}

function PrimaryActions({
  onCancel,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
}: {
  onCancel: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      {secondaryLabel && onSecondary ? (
        <Button type="button" variant="outline" onClick={onSecondary}>
          {secondaryLabel}
        </Button>
      ) : null}
      <Button type="button" disabled={primaryDisabled} onClick={onPrimary}>
        {primaryLabel}
      </Button>
    </div>
  );
}
