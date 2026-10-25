"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { BLUEPRINT_FIXTURES } from "@/lib/solutions/blueprint";
import { CONNECTOR_FIXTURES } from "@/lib/solutions/connectors";
import {
  applyEdits,
  groupPlan,
  materializePlan,
  recommendBlueprints,
  type IPlanEdit,
  type IRecommendationEvidence,
} from "@/lib/solutions/plan";
import { cn } from "@/lib/utils";
import {
  EPlanGroup,
  EPlanItemState,
  type IInstallPlan,
  type IPlanItem,
} from "@/types/solution/install-plan";

/**
 * Review the proposed setup before anything is created (GIN-452).
 *
 * The plan is derived during render from the chosen blueprint plus the user's
 * edits, so a parameter change re-materializes and the preview updates without
 * a round trip. Nothing here writes — install is the caller's job (GIN-453).
 */

const GROUP_LABELS: Record<EPlanGroup, string> = {
  [EPlanGroup.Journey]: "Journey",
  [EPlanGroup.Structure]: "Structure",
  [EPlanGroup.Work]: "Work",
  [EPlanGroup.Agents]: "Agents",
  [EPlanGroup.Integrations]: "Integrations",
  [EPlanGroup.Approvals]: "Approvals",
  [EPlanGroup.Views]: "Views",
  [EPlanGroup.Documents]: "Documents",
};

/** Skill profiles the platform can provide today. */
const AVAILABLE_SKILLS = ["bmad.analyst", "bmad.pm", "bmad.architect"];

function PlanItemRow({
  item,
  onDeselect,
  onReselect,
  onWaive,
}: {
  item: IPlanItem;
  onDeselect: () => void;
  onReselect: () => void;
  onWaive: (rationale: string) => void;
}) {
  const [waiving, setWaiving] = useState(false);
  const [rationale, setRationale] = useState("");

  const blocked = item.state === EPlanItemState.Blocked;
  const off = item.state === EPlanItemState.Deselected;

  return (
    <li
      className={cn(
        "rounded-md border px-3 py-2 text-sm transition-colors",
        blocked && "border-destructive/40 bg-destructive/5",
        off && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("font-medium", off && "line-through")}>
            {item.label}
            {item.required ? (
              <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-muted-foreground">
                Required
              </span>
            ) : null}
            {item.state === EPlanItemState.Waived ? (
              <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-amber-600 dark:text-amber-500">
                Waived
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{item.provenance}</p>
        </div>

        <div className="flex shrink-0 gap-1">
          {blocked ? null : off ? (
            <Button type="button" size="sm" variant="ghost" onClick={onReselect}>
              Add back
            </Button>
          ) : item.required ? (
            item.state === EPlanItemState.Selected ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setWaiving(true)}
              >
                Waive
              </Button>
            ) : null
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Remove ${item.label} from the plan`}
              onClick={onDeselect}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {waiving ? (
        <div className="mt-2 flex gap-2">
          <label className="sr-only" htmlFor={`waive-${item.key}`}>
            Reason for waiving {item.label}
          </label>
          <input
            id={`waive-${item.key}`}
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            placeholder="Why is this being skipped?"
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="sm"
            disabled={!rationale.trim()}
            onClick={() => {
              onWaive(rationale);
              setWaiving(false);
            }}
          >
            Save
          </Button>
        </div>
      ) : null}

      {[...item.blockers, ...item.warnings].map((warning) => (
        <p
          key={warning.code}
          className={cn(
            "mt-2 flex items-start gap-1.5 text-[11px]",
            blocked ? "text-destructive" : "text-muted-foreground",
          )}
        >
          <HugeiconsIcon icon={AlertCircleIcon} className="mt-px size-3 shrink-0" />
          <span>
            {warning.message}
            {warning.remediation ? ` ${warning.remediation}` : null}
          </span>
        </p>
      ))}
    </li>
  );
}

export function InstallPlanReview({
  evidence,
  workspaceSlug,
  setupDraftId,
  parameters,
  onInstall,
  onBlank,
  onCancel,
  installing = false,
  confirmLabel,
}: {
  evidence: IRecommendationEvidence;
  workspaceSlug: string;
  setupDraftId: string;
  /** Values the user decided during intake — changes re-materialize the plan. */
  parameters: Record<string, unknown>;
  onInstall: (plan: IInstallPlan) => void;
  onBlank: () => void;
  onCancel: () => void;
  installing?: boolean;
  /** Defaults to a create-now label; the wizard confirms the plan instead. */
  confirmLabel?: string;
}) {
  const recommendation = recommendBlueprints(BLUEPRINT_FIXTURES, evidence);

  const [chosenKey, setChosenKey] = useState<string | null>(
    recommendation.recommended?.blueprint_key ?? null,
  );
  const [edits, setEdits] = useState<Record<string, IPlanEdit>>({});
  const [showAlternatives, setShowAlternatives] = useState(false);

  const definition = BLUEPRINT_FIXTURES.find((b) => b.identity.key === chosenKey) ?? null;

  const plan = definition
    ? applyEdits(
        materializePlan(definition, {
          workspace_slug: workspaceSlug,
          setup_draft_id: setupDraftId,
          connectors: CONNECTOR_FIXTURES,
          available_skill_refs: AVAILABLE_SKILLS,
          decided_parameters: parameters,
          inferred_parameters: {},
        }),
        edits,
      )
    : null;

  const setEdit = (key: string, edit: IPlanEdit | null) =>
    setEdits((prev) => {
      const next = { ...prev };
      if (edit) next[key] = edit;
      else delete next[key];
      return next;
    });

  const choose = (key: string) => {
    setChosenKey(key);
    setEdits({});
  };

  if (!plan || !definition) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Nothing in your setup points to a specific starting blueprint. You can start blank and
          add structure later.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onBlank}>
            Start blank
          </Button>
        </div>
      </div>
    );
  }

  const groups = groupPlan(plan);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-sm font-medium">{definition.identity.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {recommendation.recommended?.blueprint_key === chosenKey
            ? recommendation.recommended.rationale
            : definition.identity.description}
        </p>
        {recommendation.recommended?.blueprint_key === chosenKey ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {recommendation.recommended.signals
              .filter((signal) => signal.weight > 0)
              .map((signal) => (
                <li
                  key={signal.code}
                  className="rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {signal.label}
                </li>
              ))}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={showAlternatives}
            onClick={() => setShowAlternatives((open) => !open)}
          >
            {showAlternatives ? "Hide alternatives" : "See alternatives"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onBlank}>
            Start blank instead
          </Button>
        </div>

        {showAlternatives ? (
          <ul className="mt-3 space-y-1.5">
            {recommendation.alternatives.map((alternative) => (
              <li
                key={alternative.blueprint_key}
                className="flex items-start justify-between gap-2 rounded-md border bg-background px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium">{alternative.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {alternative.rationale}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!alternative.eligible || alternative.blueprint_key === chosenKey}
                  onClick={() => choose(alternative.blueprint_key)}
                >
                  Use this
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="text-foreground">{plan.counts.selected} will be created</span>
        {plan.counts.deselected > 0 ? <span>{plan.counts.deselected} removed</span> : null}
        {plan.counts.waived > 0 ? <span>{plan.counts.waived} waived</span> : null}
        {plan.counts.blocked > 0 ? (
          <span className="text-destructive">{plan.counts.blocked} blocked</span>
        ) : null}
      </div>

      <div className="max-h-[22rem] space-y-4 overflow-y-auto pr-1">
        {groups.map(({ group, items }) => (
          <section key={group}>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {GROUP_LABELS[group]}{" "}
              <span className="font-normal tabular-nums">({items.length})</span>
            </h3>
            <ul className="mt-2 space-y-1.5">
              {items.map((item) => (
                <PlanItemRow
                  key={item.key}
                  item={item}
                  onDeselect={() => setEdit(item.key, { state: EPlanItemState.Deselected })}
                  onReselect={() => setEdit(item.key, null)}
                  onWaive={(rationale) =>
                    setEdit(item.key, { state: EPlanItemState.Waived, rationale })
                  }
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {plan.warnings.map((warning) => (
        <p
          key={warning.code}
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
          <span>
            {warning.message}
            {warning.remediation ? ` ${warning.remediation}` : null}
          </span>
        </p>
      ))}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {plan.installable ? (
          <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />
            Ready to create
          </p>
        ) : null}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!plan.installable || installing}
          onClick={() => onInstall(plan)}
        >
          {installing
            ? "Working…"
            : (confirmLabel ?? `Create ${plan.counts.selected} items`)}
        </Button>
      </div>
    </div>
  );
}
