"use client";

import { Cancel01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { GigsAiChat } from "@/components/ai/gigs-ai-chat";
import { Button } from "@/components/ui/button";
import { useSeededGigsThread } from "@/hooks/ai/use-seeded-gigs-thread";
import { cn } from "@/lib/utils";
import type { ILanguageLoc } from "@/types/code/metrics";
import type { ICodebaseIntelligence, INodeInspectorDetail } from "@/types/code/intelligence";

/**
 * Full-screen "Ask Code Intelligence" — the expanded form of Ask Codebase.
 *
 * A shell around the real agent: file tree on the left, the live GigsAI conversation
 * in the middle, selected-symbol context on the right. The conversation, its composer
 * and its citation peek all belong to GigsAiChat — this file owns only the chrome.
 *
 * It previously hand-rolled all of that against a fixture: two canned answers keyed by
 * prompt string, a fabricated reply for everything else, and five "mode" buttons whose
 * state nothing ever read. All deleted (GIN-155).
 */
export function CodebaseAskScreen({
  workspaceSlug,
  projectId,
  data,
  detail,
  languages,
  onSelect,
  onClose,
}: {
  workspaceSlug: string;
  projectId: string;
  data: ICodebaseIntelligence;
  detail: INodeInspectorDetail | null;
  languages: ILanguageLoc[] | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  // The real agent, same one GigsAI mounts: situation-primed with this project's graph
  // and docs, and it cites real files (GIN-155). It replaced a lookup table of two
  // hand-written answers plus a fabricated "I'd analyze..." reply for everything else.
  // Bind the thread to THIS project so the agent's situation resolves the connected
  // repo/index/docs — without it the agent falsely reports "no repository" (GIN-312).
  const { threadId, error } = useSeededGigsThread(workspaceSlug, null, projectId);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background">
      {/* slim header — no loud tab row */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={SparklesIcon} className="size-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Ask Code Intelligence</span>
          {data.repo ? (
            <span className="font-mono text-xs text-muted-foreground">
              {[data.repo.repo, data.repo.branch, data.repo.commitSha?.slice(0, 7)]
                .filter(Boolean)
                .join(" / ")}
            </span>
          ) : null}
        </div>
        <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left: files */}
        <aside className="hidden w-56 shrink-0 border-r md:block">
          <MiniTree data={data} selectedId={detail?.id ?? null} onSelect={onSelect} />
        </aside>

        {/* center: THE conversation — single focus. GigsAiChat brings its own composer,
            streaming, starter suggestions and citation peek, so there is nothing left
            here to hand-roll. */}
        <main className="flex min-w-0 flex-1 flex-col">
          {error ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-destructive">
              {error}
            </div>
          ) : threadId ? (
            <GigsAiChat
              key={threadId}
              workspaceSlug={workspaceSlug}
              threadId={threadId}
              projectId={projectId}
              variant="full"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Starting a chat…
            </div>
          )}
        </main>

        {/* right: context + relations (moved out of center) */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l p-4 lg:block">
          <ContextRail data={data} detail={detail} languages={languages} onSelect={onSelect} />
        </aside>
      </div>
    </div>
  );
}

/* ---------- rails ---------- */

function MiniTree({
  data,
  selectedId,
  onSelect,
}: {
  data: ICodebaseIntelligence;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // The real indexed tree. This used to list `data.nodes` — the fixture's invented
  // auth cast (auth_service.py, AuthService, issueToken()), shown verbatim next to a
  // chat about your actual repo (GIN-156).
  const children = data.tree?.children ?? [];
  return (
    <div className="flex flex-col p-2">
      <div className="px-1.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {data.repo?.repo ?? "Repository"}
      </div>
      {children.length === 0 ? (
        <p className="px-1.5 py-2 text-xs text-muted-foreground">
          {data.tree ? "Nothing indexed yet." : "Loading files…"}
        </p>
      ) : (
        children.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onSelect(n.id)}
            className={cn(
              "truncate rounded px-1.5 py-1 text-left text-xs transition-colors",
              selectedId === n.id
                ? "bg-accent text-foreground"
                : "text-foreground/80 hover:bg-accent/60",
            )}
          >
            {n.name}
          </button>
        ))
      )}
    </div>
  );
}

function ContextRail({
  data,
  detail,
  languages,
  onSelect,
}: {
  data: ICodebaseIntelligence;
  detail: INodeInspectorDetail | null;
  languages: ILanguageLoc[] | null;
  onSelect: (id: string) => void;
}) {
  const files = data.metrics?.find((m) => m.key === "files")?.value ?? "—";
  // Only the selected symbol's own traceability. This used to fall back to the fixture's
  // `file:auth_service`, so asking about your repo showed an invented service's chain
  // (GIN-155). Nothing selected means nothing to relate — the block just hides.
  const trace = detail?.traceability;
  const callers = detail?.dependents ?? [];
  const callees = detail?.dependencies ?? [];

  return (
    <div className="flex flex-col gap-5 text-sm">
      <RailBlock title="Context at a glance">
        {/* Each row is skipped when unknown rather than filled with a stand-in. */}
        <Kv k="Repository" v={data.repo?.repo ?? "—"} />
        {data.repo?.branch ? <Kv k="Branch" v={data.repo.branch} /> : null}
        {data.repo?.commitSha ? <Kv k="Commit" v={data.repo.commitSha.slice(0, 7)} /> : null}
        <Kv k="Files" v={String(files)} />
        {languages && languages.length > 0 ? (
          <Kv k="Language" v={languages.slice(0, 2).map((l) => l.name).join(", ")} />
        ) : null}
      </RailBlock>

      {trace ? (
        <RailBlock title="Related context">
          {trace.requirements.map((r) => (
            <RailLink key={r.code} code={r.code} label={r.title} />
          ))}
          {trace.stories.map((s) => (
            <RailLink key={s.code} code={s.code} label={s.title} />
          ))}
        </RailBlock>
      ) : null}

      <RailBlock title="Relations">
        <RelCount label="Callers" n={callers.length} />
        {callers.slice(0, 4).map((c) => (
          <RailRow key={c.id} onClick={() => onSelect(c.id)}>
            {c.name}
          </RailRow>
        ))}
        <RelCount label="Callees" n={callees.length} />
        {callees.slice(0, 4).map((c) => (
          <RailRow key={c.id} onClick={() => onSelect(c.id)}>
            {c.name}
          </RailRow>
        ))}
        <RelCount label="Tests" n={detail?.tests ?? 0} />
      </RailBlock>
    </div>
  );
}

function RailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="truncate font-medium text-foreground">{v}</span>
    </div>
  );
}

function RailLink({ code, label }: { code: string; label: string }) {
  return (
    <div className="text-xs">
      <span className="font-mono font-medium text-primary">{code}</span>{" "}
      <span className="text-foreground/90">{label}</span>
    </div>
  );
}

function RelCount({ label, n }: { label: string; n: number }) {
  return (
    <div className="mt-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{n}</span>
    </div>
  );
}

function RailRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="truncate rounded px-1.5 py-0.5 text-left text-xs text-foreground/90 hover:bg-accent"
    >
      {children}
    </button>
  );
}

