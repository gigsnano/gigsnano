"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrain01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  SparklesIcon,
  Store01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { usePublishGig, useStoryGig, useStoryMatch } from "@/hooks/story/use-story-detail";
import { useStaffPanelStore } from "@/store/ui/staff-panel.store";
import { cn } from "@/lib/utils";
import type { IGigState, IMatchCandidate } from "@/types/story/agent-run";

const ESCROW_LABEL: Record<NonNullable<IGigState["escrow_state"]>, string> = {
  open: "Open · awaiting bids",
  held: "Funded",
  in_review: "In review",
  released: "Released",
  refunded: "Refunded",
};

const GENERIC_REASON = "general availability";

/** Qualitative band for a match score, so the number reads as a signal not noise. */
function matchQuality(score: number): { label: string; className: string } {
  if (score >= 70) return { label: "Strong match", className: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 45) return { label: "Good match", className: "text-primary" };
  return { label: "Fair match", className: "text-muted-foreground" };
}

/**
 * "Staff this work item" (GIN-187): ranked AI + human candidates + publish as a
 * marketplace gig. Opt-in by design — collapsed by default, the preference
 * persists per-user, and the (AI) match only loads once expanded, so teams that
 * don't staff via the marketplace never see the noise or pay the fetch. An active
 * gig still surfaces a badge on the collapsed header so it's never hidden.
 */
export function IssueStaffThis({
  workspaceSlug,
  projectId,
  storyId,
  storyTitle,
  storyDescription,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
  storyTitle: string;
  storyDescription: string;
}) {
  const open = useStaffPanelStore((s) => s.open);
  const setOpen = useStaffPanelStore((s) => s.setOpen);

  const { data: gig } = useStoryGig(workspaceSlug, projectId, storyId);
  const publish = usePublishGig(workspaceSlug, projectId, storyId);
  const published = Boolean(gig?.published || publish.data);
  // Lazy: the AI match only fires once the panel is open and we're not already published.
  const match = useStoryMatch(workspaceSlug, projectId, storyId, open && !published);
  const candidates = match.data;

  const listingId = gig?.listing_id ?? publish.data?.id ?? null;
  const count = published ? undefined : candidates?.length;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md py-1 text-left outline-none",
          "transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-[0.99]",
          "focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
            !open && "-rotate-90",
          )}
        />
        <span className="text-sm font-medium text-foreground">Staff this work item</span>
        {count ? <span className="text-sm tabular-nums text-muted-foreground">{count}</span> : null}

        <span className="ml-auto flex items-center gap-2">
          {published && gig?.escrow_state ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              {ESCROW_LABEL[gig.escrow_state]}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100 data-[on=true]:opacity-100" data-on={open}>
              <HugeiconsIcon icon={SparklesIcon} className="size-3" />
              AI-ranked
            </span>
          )}
        </span>
      </button>

      {/* Smooth height reveal (grid-rows 0fr→1fr) — no JS measurement. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {open ? (
            <StaffBody
              published={published}
              gig={gig}
              listingId={listingId}
              candidates={candidates}
              loading={match.isLoading}
              publish={publish}
              storyId={storyId}
              storyTitle={storyTitle}
              storyDescription={storyDescription}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StaffBody({
  published,
  gig,
  listingId,
  candidates,
  loading,
  publish,
  storyId,
  storyTitle,
  storyDescription,
}: {
  published: boolean;
  gig: IGigState | undefined;
  listingId: string | null;
  candidates: IMatchCandidate[] | undefined;
  loading: boolean;
  publish: ReturnType<typeof usePublishGig>;
  storyId: string;
  storyTitle: string;
  storyDescription: string;
}) {
  // Published → show the escrow state + a link into the listing to hire/manage.
  if (published && gig?.escrow_state) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            Escrow · {ESCROW_LABEL[gig.escrow_state]}
            {gig.amount_cents != null ? ` · $${(gig.amount_cents / 100).toFixed(0)}` : ""}
          </span>
          {listingId && (
            <Link
              href={`/marketplace/listings/${listingId}`}
              className="group inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open gig
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
              />
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 py-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-6 animate-pulse rounded-md bg-muted" style={{ opacity: 1 - i * 0.25 }} />
        ))}
      </div>
    );
  }

  const maxScore = Math.max(1, ...(candidates ?? []).map((c) => c.score));
  const humans = (candidates ?? []).filter((c) => c.type === "human");
  const broadMatch = humans.length > 0 && humans.every((c) => c.reason === GENERIC_REASON);

  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs text-muted-foreground">
        Ranked candidates for this work — AI agents and humans, matched to the task.
      </p>

      {candidates?.length ? (
        <ul className="space-y-1">
          {candidates.map((c, i) => (
            <CandidateRow
              key={`${c.type}-${c.id}`}
              candidate={c}
              best={i === 0}
              fill={c.score / maxScore}
              index={i}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-md bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
          No candidates yet — publish as a gig to invite bids.
        </p>
      )}

      {broadMatch ? (
        <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
          <HugeiconsIcon icon={SparklesIcon} className="mt-px size-3 shrink-0 text-muted-foreground" />
          Matches are broad. Add a clearer title, description, or labels to this work item to
          sharpen the ranking.
        </p>
      ) : null}

      {/* Owner action — what to actually do next. */}
      {publish.data ? (
        <Link
          href={`/marketplace/listings/${publish.data.id}`}
          className="group flex items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 text-xs transition-colors hover:bg-muted/50"
        >
          <span className="font-medium text-foreground">Published — review bids &amp; hire</span>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-4 shrink-0 text-primary transition-transform duration-150 ease-out group-hover:translate-x-0.5"
          />
        </Link>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground">Ready to staff this?</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Publish it as a gig — candidates bid, you fund escrow, and work delivers straight to
            review.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={publish.isPending}
            onClick={() =>
              publish.mutate({ story_id: storyId, title: storyTitle, description: storyDescription })
            }
            className="mt-2 gap-1.5 transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            <HugeiconsIcon icon={Store01Icon} className="size-3.5" />
            {publish.isPending ? "Publishing…" : "Publish as gig"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** One ranked candidate. Humans link to their marketplace profile (vet before
 * hiring); the AI agent row is informational. Staggered mount reveal. */
function CandidateRow({
  candidate: c,
  best,
  fill,
  index,
}: {
  candidate: IMatchCandidate;
  best: boolean;
  fill: number;
  index: number;
}) {
  const quality = matchQuality(c.score);
  const isAgent = c.type === "agent";
  const reason = isAgent || c.reason !== GENERIC_REASON ? c.reason : null;

  const body = (
    <div
      className="space-y-1 rounded-md px-2 py-1.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-center gap-2 text-sm">
        <HugeiconsIcon
          icon={isAgent ? AiBrain01Icon : UserMultipleIcon}
          className={cn("size-3.5 shrink-0", isAgent ? "text-primary" : "text-muted-foreground")}
        />
        <span className="min-w-0 truncate text-foreground">{c.name}</span>
        {best ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            Best match
          </span>
        ) : null}
        {c.est_rate != null ? (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">${c.est_rate}/h</span>
        ) : null}
        <span
          className={cn(
            "shrink-0 text-[11px] font-medium",
            c.est_rate == null && "ml-auto",
            quality.className,
          )}
        >
          {quality.label}
        </span>
        {!isAgent ? (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover:translate-x-0.5 group-hover:opacity-100"
          />
        ) : null}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out"
          style={{ transform: `scaleX(${Math.max(0.02, fill)})` }}
        />
      </div>
      {reason ? <p className="text-[11px] text-muted-foreground">{reason}</p> : null}
    </div>
  );

  if (isAgent) return <li>{body}</li>;

  return (
    <li>
      <Link
        href={`/marketplace/talent/${c.id}`}
        className="group block rounded-md outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/60"
        aria-label={`View ${c.name}'s profile`}
      >
        {body}
      </Link>
    </li>
  );
}
