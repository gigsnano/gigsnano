"use client";

import { useState } from "react";

import {
  useAnalysePackage,
  useApplyImport,
  useBuildImportPlan,
  useDecideImportChanges,
  useImportPlan,
  usePackageFindings,
  useRollbackImport,
  useUpdateFinding,
  useUpdatePackageDocument,
  useUploadPackage,
} from "@/hooks/package-import/use-package-import";
import { useProject } from "@/hooks/project/use-projects";
import { blockingCount, nextAction, readiness } from "@/lib/package-import/intake";
import {
  EImportChangeStatus,
  EImportStrategy,
  EParseState,
  type EFindingStatus,
  type EPackageDocType,
  type IApplyResult,
  type IDocumentPackage,
  type IPackageFinding,
  type IUploadPackageFile,
} from "@/types";

import { AnalyseStep } from "./analyse-step";
import { FindingsStep } from "./findings-step";
import { IntakeStepper, type IIntakeStep, type IntakeStepId } from "./intake-stepper";
import { RepositoryStep } from "./repository-step";
import { ReviewStep } from "./review-step";
import { StrategyStep } from "./strategy-step";
import { SummaryStep } from "./summary-step";
import { UploadStep } from "./upload-step";

function messageFor(error: unknown, fallback: string): string {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: number }).status
      : undefined;
  if (status === 403) return "You do not have permission to do this in this project.";
  if (status === 413) return "That package is too large. Remove some files and try again.";
  if (status === 409)
    return "This package's plan was already applied. Roll it back before proposing again.";
  return fallback;
}

/** The guided intake (GIN-393): upload → analyse → review findings → strategy →
 *  repository → review changes → create. Only the last step changes the project. */
export function IntakeWizard({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const [pkg, setPkg] = useState<IDocumentPackage | null>(null);
  const [step, setStep] = useState<IntakeStepId>("upload");
  const [applyResult, setApplyResult] = useState<IApplyResult | null>(null);
  const [analysedIds, setAnalysedIds] = useState<string[]>([]);
  const packageId = pkg?.id ?? null;

  const project = useProject(workspaceSlug, projectId);
  const upload = useUploadPackage(workspaceSlug, projectId);
  const analyse = useAnalysePackage(workspaceSlug, projectId);
  const findings = usePackageFindings(workspaceSlug, projectId, packageId);
  const updateFinding = useUpdateFinding(workspaceSlug, projectId, packageId ?? "");
  const updateDocument = useUpdatePackageDocument(workspaceSlug, projectId, packageId ?? "");
  const plan = useImportPlan(workspaceSlug, projectId, packageId);
  const buildPlan = useBuildImportPlan(workspaceSlug, projectId, packageId ?? "");
  const decide = useDecideImportChanges(workspaceSlug, projectId, packageId ?? "");
  const apply = useApplyImport(workspaceSlug, projectId, packageId ?? "");
  const rollback = useRollbackImport(workspaceSlug, projectId, packageId ?? "");

  const analysis = findings.data ?? null;
  const planData = plan.data ?? null;
  const hasFindings = (analysis?.findings.length ?? 0) > 0;
  const blocking = analysis ? blockingCount(analysis.findings) : 0;
  const approvedChanges =
    planData?.changes.filter(
      (c) =>
        c.status === EImportChangeStatus.Approved || c.status === EImportChangeStatus.Applied,
    ).length ?? 0;

  const steps: IIntakeStep[] = [
    {
      id: "upload",
      label: "Upload package",
      hint: pkg ? `${pkg.counts.ready} ready` : "No documents yet",
      state: step === "upload" ? "active" : pkg ? "complete" : "todo",
    },
    {
      id: "analyse",
      label: "Analyse",
      hint: hasFindings ? `${analysis?.findings.length} findings` : "Not run yet",
      state: step === "analyse" ? "active" : hasFindings ? "complete" : "todo",
    },
    {
      id: "review",
      label: "Review findings",
      hint: blocking > 0 ? `${blocking} to resolve` : hasFindings ? "Ready" : "Nothing yet",
      state:
        step === "review"
          ? "active"
          : !hasFindings
            ? "todo"
            : blocking > 0
              ? "warning"
              : "complete",
    },
    {
      id: "strategy",
      label: "Planning strategy",
      hint: planData ? planData.strategy : "Not chosen",
      state: step === "strategy" ? "active" : planData ? "complete" : "todo",
    },
    {
      id: "repository",
      label: "Repository",
      hint: project.data?.repo_full_name ?? "Optional",
      state:
        step === "repository" ? "active" : project.data?.repo_full_name ? "complete" : "todo",
    },
    {
      id: "changes",
      label: "Review changes",
      hint: planData ? `${approvedChanges}/${planData.changes.length} approved` : "No plan yet",
      state:
        step === "changes"
          ? "active"
          : !planData
            ? "todo"
            : planData.blocking_conflicts.length > 0
              ? "warning"
              : approvedChanges > 0
                ? "complete"
                : "todo",
    },
    {
      id: "create",
      label: "Create plan",
      hint: applyResult ? `${applyResult.applied} created` : "Nothing created yet",
      state:
        step === "create"
          ? "active"
          : applyResult
            ? applyResult.failed > 0
              ? "warning"
              : "complete"
            : "todo",
    },
  ];

  const readinessResult = readiness({
    documentsTotal: pkg?.counts.total ?? 0,
    documentsReady: pkg?.counts.ready ?? 0,
    findings: analysis?.findings ?? [],
    planChangeCount: planData?.changes.length ?? 0,
    approvedChangeCount: approvedChanges,
    repositoryConnected: Boolean(project.data?.repo_full_name),
  });

  const recommendation = nextAction({
    hasPackage: Boolean(pkg),
    hasFindings,
    conflicts: blocking,
    hasPlan: Boolean(planData),
    approvedChanges,
    applied: Boolean(applyResult),
  });

  const handleUpload = (files: IUploadPackageFile[]) => {
    upload.mutate({ name: "Imported package", files }, { onSuccess: (created) => setPkg(created) });
  };

  /** One request per document, in sequence.
   *
   *  A whole package in one call is unbounded model work — a seven-document
   *  package ran past the gateway's 230s timeout and the page sat on "Reading
   *  documents…" forever. Per document each request is bounded, finished
   *  documents show as done, and one slow document cannot strand the rest. */
  const handleAnalyse = async () => {
    if (!pkg) return;
    const readable = pkg.documents.filter((d) => d.parse_state === EParseState.Ok);
    // react-doctor flags the await-in-loop below and suggests Promise.all. That
    // advice is wrong here: firing every document at once is the unbounded
    // concurrent model work that caused the timeout in the first place. The
    // sequencing IS the fix — one bounded request at a time, with progress.
    setAnalysedIds([]);
    for (const document of readable) {
      try {
        await analyse.mutateAsync({ packageId: pkg.id, documentId: document.id });
      } catch {
        // Recorded by the mutation's error state; keep reading the others.
      }
      setAnalysedIds((prev) => [...prev, document.id]);
    }
    setStep("review");
  };

  const handleResolve = (finding: IPackageFinding, status: EFindingStatus) => {
    updateFinding.mutate({ findingId: finding.id, payload: { status } });
  };

  const handleReclassify = (documentId: string, docType: EPackageDocType) => {
    updateDocument.mutate({ documentId, payload: { doc_type: docType } });
  };

  const handleStrategy = (strategy: EImportStrategy) => {
    buildPlan.mutate(strategy, { onSuccess: () => setStep("repository") });
  };

  const handleApply = () => {
    apply.mutate(undefined, {
      onSuccess: (result) => {
        setApplyResult(result);
        setStep("create");
      },
    });
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <IntakeStepper
        steps={steps}
        onSelect={(id) => {
          if (id === "analyse" && !pkg) return;
          if (id === "review" && !hasFindings) return;
          if (id === "strategy" && !hasFindings) return;
          if ((id === "repository" || id === "changes") && !planData) return;
          if (id === "create" && !applyResult) return;
          setStep(id);
        }}
      />

      <div className="min-w-0 flex-1">
        {step === "upload" ? (
          <UploadStep
            pkg={pkg}
            isUploading={upload.isPending}
            error={upload.isError ? messageFor(upload.error, "Could not upload that package.") : null}
            onUpload={handleUpload}
            onContinue={() => setStep("analyse")}
            onReclassify={handleReclassify}
          />
        ) : null}

        {step === "analyse" && pkg ? (
          <AnalyseStep
            pkg={pkg}
            isAnalysing={analyse.isPending}
            error={
              analyse.isError ? messageFor(analyse.error, "Could not analyse these documents.") : null
            }
            onAnalyse={() => void handleAnalyse()}
            analysedIds={analysedIds}
          />
        ) : null}

        {step === "review" && analysis ? (
          <div className="flex flex-col gap-5">
            <FindingsStep
              analysis={analysis}
              onResolve={handleResolve}
              isResolving={updateFinding.isPending}
            />
            <div className="flex justify-end border-t pt-4">
              <button
                type="button"
                onClick={() => setStep("strategy")}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                Choose a planning strategy
              </button>
            </div>
          </div>
        ) : null}

        {step === "strategy" ? (
          <StrategyStep
            selected={planData?.strategy ?? null}
            isBuilding={buildPlan.isPending}
            error={
              buildPlan.isError
                ? messageFor(buildPlan.error, "Could not propose a structure.")
                : null
            }
            onChoose={handleStrategy}
          />
        ) : null}

        {step === "repository" ? (
          <RepositoryStep
            workspaceSlug={workspaceSlug}
            project={project.data}
            onContinue={() => setStep("changes")}
          />
        ) : null}

        {step === "changes" && planData ? (
          <ReviewStep
            plan={planData}
            isDeciding={decide.isPending}
            isApplying={apply.isPending}
            error={apply.isError ? messageFor(apply.error, "Could not create the plan.") : null}
            onDecide={(decision, changeIds) => decide.mutate({ decision, changeIds })}
            onApply={handleApply}
          />
        ) : null}

        {step === "create" && applyResult ? (
          <SummaryStep
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            result={applyResult}
            plan={planData}
            readinessResult={readinessResult}
            nextActionText={recommendation}
            isRollingBack={rollback.isPending}
            onRollback={() =>
              rollback.mutate(undefined, { onSuccess: () => setApplyResult(null) })
            }
            onRetry={handleApply}
          />
        ) : null}
      </div>
    </div>
  );
}
