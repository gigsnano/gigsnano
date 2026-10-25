"use client";

/**
 * Structured cards for clarification, results, mutation previews and receipts
 * (GIN-507).
 *
 * The load-bearing rule: **a material write can only be confirmed from one of
 * these cards, never from the transcript.** `onConfirm` takes the hash rendered
 * in this card, so the thing the user approved and the thing the backend
 * executes are the same object by construction. A "yes" spoken at a transcript
 * has nothing to bind to, which is exactly why it must not be enough.
 *
 * Every resolved field is individually editable — a wrong assignee should cost
 * one tap, not a re-dictated request.
 */

import { Alert01Icon, ArrowRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EFieldSource,
  type IClarification,
  type IMutationProposal,
  type IReadResult,
  type IReceipt,
} from "@/types/voice";

/** Only inferred fields are badged. Badging everything trains people to skim. */
const INFERRED: Record<string, string> = {
  [EFieldSource.Default]: "default",
  [EFieldSource.Generated]: "written by AI",
};

function Card({ title, children, tone = "default" }: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section
      className={cn(
        "gn-voice-card rounded-xl border bg-card p-3 text-card-foreground",
        tone === "danger" && "border-destructive/40",
      )}
      aria-label={title}
    >
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

// ── Clarification ───────────────────────────────────────────────────────────

export function ClarificationCard({
  clarification,
  onChoose,
}: {
  clarification: IClarification;
  onChoose: (candidateId: string) => void;
}) {
  return (
    <Card title="Which one?">
      <p className="mb-2 text-sm">{clarification.question}</p>
      {/* A radiogroup, so pointer, keyboard and voice ("the second one") all
          land on the same announced ordering. */}
      <ul role="radiogroup" aria-label={clarification.question} className="space-y-1">
        {clarification.candidates.map((candidate, index) => (
          <li key={candidate.id}>
            <button
              type="button"
              role="radio"
              aria-checked={false}
              onClick={() => onChoose(candidate.id)}
              className="gn-voice-choice flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span>
                <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                {candidate.label}
                {candidate.evidence ? (
                  <span className="block text-xs text-muted-foreground">{candidate.evidence}</span>
                ) : null}
              </span>
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 opacity-60" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Read result ─────────────────────────────────────────────────────────────

export function ResultCard({ result }: { result: IReadResult }) {
  if (!result.available) {
    return (
      <Card title="Result" tone="danger">
        <p className="text-sm">
          I couldn&rsquo;t check that just now — so this is not &ldquo;nothing found&rdquo;.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Result">
      <p className="mb-2 text-sm">
        <strong>{result.total}</strong> {result.total === 1 ? "item" : "items"}
        <span className="text-muted-foreground"> · {result.filters}</span>
      </p>
      <ul className="space-y-1">
        {result.items.map((item) => (
          <li key={item.id}>
            <a
              href={item.url}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
            >
              <span className="truncate">
                <span className="mr-2 font-mono text-xs text-muted-foreground">{item.code}</span>
                {item.title}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{item.status}</span>
            </a>
          </li>
        ))}
      </ul>
      {result.truncated ? (
        /* Never let a page imply the whole set — the count above is the total,
           and this says plainly that the list below is not. */
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {result.items.length} of {result.total}. Say &ldquo;next&rdquo; for more.
        </p>
      ) : null}
    </Card>
  );
}

// ── Mutation preview ────────────────────────────────────────────────────────

export function MutationPreviewCard({
  proposal,
  onConfirm,
  onEditField,
  onCancel,
  busy = false,
}: {
  proposal: IMutationProposal;
  /** Takes the hash rendered here, so approval and execution cannot diverge. */
  onConfirm: (hash: string) => void;
  /** Omitted where per-field editing has no home yet (the voice call screen):
   *  a "Change" button that does nothing is worse than no button. */
  onEditField?: (name: string) => void;
  onCancel: () => void;
  /** Set while the confirmation is in flight. A second tap would land against
   *  an already-spent proposal and come back as "no longer current", which
   *  reads as a failure the user caused. */
  busy?: boolean;
}) {
  const verb =
    proposal.action === "create" ? "Create" : proposal.action === "update" ? "Update" : "Comment on";

  return (
    <Card title={`Review before ${proposal.action === "create" ? "creation" : "saving"}`}>
      <dl className="space-y-1">
        {proposal.fields.map((field) => {
          const before = proposal.delta?.[field.name]?.[0];
          return (
            <div key={field.name} className="flex items-start justify-between gap-3 text-sm">
              <dt className="w-28 shrink-0 pt-1 text-muted-foreground">{field.label}</dt>
              <dd className="flex flex-1 items-start justify-between gap-2">
                <span className="pt-1">
                  {before !== undefined ? (
                    <>
                      <s className="text-muted-foreground">{before}</s>{" "}
                      <span aria-hidden>→</span>{" "}
                    </>
                  ) : null}
                  {field.value}
                  {INFERRED[field.source] ? (
                    /* The quiet failure of a drafting agent is a user approving
                       a value it invented. Naming the source is the defence. */
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {INFERRED[field.source]}
                    </span>
                  ) : null}
                </span>
                {onEditField ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditField(field.name)}
                  >
                    Change
                  </Button>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        Proposal {proposal.hash.slice(0, 8)}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Button type="button" disabled={busy} onClick={() => onConfirm(proposal.hash)}>
          <HugeiconsIcon icon={Tick02Icon} className="size-4" />
          {busy ? "Saving…" : verb}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ── Receipt ─────────────────────────────────────────────────────────────────

export function ReceiptCard({ receipt, onRetry }: { receipt: IReceipt; onRetry?: () => void }) {
  if (receipt.outcome === "failed") {
    return (
      <Card title="Didn't go through" tone="danger">
        <p className="flex items-start gap-2 text-sm">
          <HugeiconsIcon icon={Alert01Icon} className="mt-0.5 size-4 shrink-0" />
          <span>{receipt.detail || "The change wasn't saved."}</span>
        </p>
        {receipt.recoverable_draft ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Your draft is kept — nothing was written, so retrying is safe.
          </p>
        ) : null}
        {receipt.recoverable_draft && onRetry ? (
          /* Retry is offered only when the draft is known-safe: an offer to
             retry an operation that may have half-succeeded is how duplicates
             get filed by a helpful user. */
          <Button type="button" size="sm" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card title={receipt.outcome === "deduplicated" ? "Already done" : "Done"}>
      <p className="text-sm">
        {receipt.outcome === "deduplicated"
          ? "That one was already saved, so nothing was duplicated."
          : "Saved."}{" "}
        {receipt.result_code && receipt.result_url ? (
          <a href={receipt.result_url} className="font-medium underline">
            {receipt.result_code}
          </a>
        ) : null}
      </p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{receipt.correlation_id}</p>
    </Card>
  );
}
