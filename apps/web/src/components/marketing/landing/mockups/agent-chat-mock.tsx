import type { CSSProperties } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon, SentIcon, FileEditIcon } from "@hugeicons/core-free-icons";

/**
 * Minimalist recreation of the real BMAD story chat (`board/story/*`): agent
 * header with the produced artifact, an agent message + a generated doc card,
 * a user reply, a streaming bubble, the reference-chip composer, and the
 * finalize action — all in landing tokens.
 */
export function AgentChatMock() {
  return (
    <div className="lp-window" style={{ "--lp-local": "#a78bfa" } as CSSProperties}>
      <div className="lp-window__bar">
        <span className="lp-window__dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="lp-window__title lp-mono">Story chat</span>
      </div>

      <div className="lp-window__body">
        {/* agent header */}
        <div className="flex items-center gap-2.5 border-b border-[var(--lp-line)] pb-3">
          <span className="lp-mk-avatar">AR</span>
          <div className="min-w-0">
            <p className="text-[0.84rem] font-medium text-[var(--lp-ink)]">Architect</p>
            <p className="lp-mono text-[var(--lp-ink-faint)]">Step 3 · Produces Architecture</p>
          </div>
          <span className="lp-mk-chip lp-mono ml-auto" style={{ color: "#a78bfa" }}>
            <span className="size-1 rounded-full bg-current" />
            streaming
          </span>
        </div>

        {/* conversation */}
        <div className="mt-3 space-y-2.5">
          <p className="lp-mk-msg lp-mk-msg--agent">
            Based on the PRD, I&apos;d use a Next.js front end and a FastAPI service. Review the data
            model before we lock it.
          </p>

          <div className="lp-mk-doc">
            <p className="flex items-center gap-1.5 text-[0.74rem] font-medium text-[var(--lp-ink)]">
              <HugeiconsIcon
                icon={Tick02Icon}
                className="size-3.5"
                style={{ color: "#3ecf8e" }}
                aria-hidden
              />
              architecture.md
            </p>
            <div className="mt-1.5 space-y-1">
              <span className="lp-mk-line block w-3/4" />
              <span className="lp-mk-line block w-full" />
              <span className="lp-mk-line block w-5/6" />
            </div>
          </div>

          <p className="lp-mk-msg lp-mk-msg--user">Looks right. Add a caching note and finalize it.</p>

          <div className="lp-mk-msg lp-mk-msg--agent w-fit">
            <span className="lp-bubble__dots">
              <span className="gn-typing-dot" />
              <span className="gn-typing-dot" style={{ animationDelay: "150ms" }} />
              <span className="gn-typing-dot" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
        </div>

        {/* composer */}
        <div className="lp-mk-compose mt-3">
          <span className="lp-mk-chip lp-mono" style={{ color: "#a78bfa" }}>
            <HugeiconsIcon icon={FileEditIcon} className="size-3" aria-hidden />
            prd.md
          </span>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[0.76rem] text-[var(--lp-ink-faint)]">Message the agent…</span>
            <span className="lp-mono ml-auto text-[var(--lp-ink-faint)]">@</span>
            <span
              className="grid size-6 place-items-center rounded-full text-white"
              style={{ background: "var(--lp-accent-bright)" }}
            >
              <HugeiconsIcon icon={SentIcon} className="size-3" aria-hidden />
            </span>
          </div>
        </div>

        <div className="mt-2.5 flex justify-end">
          <span
            className="rounded-lg px-3 py-1.5 text-[0.74rem] font-medium text-white"
            style={{ background: "var(--lp-accent-bright)" }}
          >
            Generate Architecture
          </span>
        </div>
      </div>
    </div>
  );
}
