"use client";

import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  useCancelDelegation,
  useDelegation,
  useRetryDelegation,
} from "@/hooks/ai/use-delegations";
import { EDelegationStatus } from "@/types/ai/agent-delegation";
import { PROVIDER_LABEL } from "@/mocks/data/agent-delegation";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<EDelegationStatus, string> = {
  [EDelegationStatus.Queued]: "Queued",
  [EDelegationStatus.Running]: "Working…",
  [EDelegationStatus.AwaitingReview]: "Ready for review",
  [EDelegationStatus.Completed]: "Completed",
  [EDelegationStatus.Failed]: "Failed",
  [EDelegationStatus.Cancelled]: "Cancelled",
};

function StatusIcon({ status }: { status: EDelegationStatus }) {
  const active =
    status === EDelegationStatus.Queued ||
    status === EDelegationStatus.Running ||
    status === EDelegationStatus.AwaitingReview;
  const done = status === EDelegationStatus.Completed;
  const failed =
    status === EDelegationStatus.Failed || status === EDelegationStatus.Cancelled;

  if (failed) {
    return (
      <HugeiconsIcon icon={Cancel01Icon} className="size-4 shrink-0 text-muted-foreground" />
    );
  }

  if (done) {
    return (
      <span
        className="t-success-check inline-block size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
        data-state="in"
      >
        <svg viewBox="0 0 48 48" width="16" height="16" fill="none" aria-hidden>
          <path
            d="M14 25 L21 32 L34 17"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return (
    <span className="t-icon-swap inline-block size-4 shrink-0" data-state={active ? "a" : "b"}>
      <span className="t-icon" data-icon="a">
        <HugeiconsIcon icon={Loading03Icon} className="size-4 t-delegation-spin" />
      </span>
      <span className="t-icon" data-icon="b">
        <HugeiconsIcon icon={Loading03Icon} className="size-4" />
      </span>
    </span>
  );
}

export function DelegationStatusCard({
  workspaceSlug,
  projectId,
  delegationId,
}: {
  workspaceSlug: string;
  projectId: string;
  delegationId: string;
}) {
  const { data: d } = useDelegation(workspaceSlug, projectId, delegationId);
  const cancel = useCancelDelegation(workspaceSlug, projectId);
  const retry = useRetryDelegation(workspaceSlug, projectId);
  const cardRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef<EDelegationStatus | null>(null);

  useEffect(() => {
    if (!d) return;
    if (prevStatus.current !== d.status) {
      prevStatus.current = d.status;
      cardRef.current?.classList.remove("t-delegation-card--enter");
      void cardRef.current?.offsetWidth;
      cardRef.current?.classList.add("t-delegation-card--enter");
    }
  }, [d]);

  if (!d) return null;

  const active =
    d.status === EDelegationStatus.Queued ||
    d.status === EDelegationStatus.Running ||
    d.status === EDelegationStatus.AwaitingReview;
  const working = d.status === EDelegationStatus.Running;

  return (
    <div
      ref={cardRef}
      className="t-delegation-card rounded-lg border p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <StatusIcon status={d.status} />
          <span className="truncate">
            {PROVIDER_LABEL[d.provider]} ·{" "}
            <span className={cn(working && "t-shimmer")}>{STATUS_LABEL[d.status]}</span>
          </span>
        </span>
      </div>

      {d.result?.kind === "pr" ? (
        <a
          href={d.result.pr_url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-block font-medium text-primary transition-opacity duration-150 hover:underline"
        >
          View pull request ({d.result.branch})
        </a>
      ) : null}
      {d.result?.kind === "document" ? (
        <p className="mt-1.5 text-muted-foreground">{d.result.summary}</p>
      ) : null}
      {d.error ? <p className="mt-1.5 text-destructive">{d.error}</p> : null}

      <div className="mt-2 flex gap-2">
        {active ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs transition-transform duration-150 ease-out active:scale-[0.97]"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(d.id)}
          >
            Cancel
          </Button>
        ) : null}
        {d.status === EDelegationStatus.Failed ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs transition-transform duration-150 ease-out active:scale-[0.97]"
            disabled={retry.isPending}
            onClick={() => retry.mutate(d.id)}
          >
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}
