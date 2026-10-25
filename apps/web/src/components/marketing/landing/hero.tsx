import type { CSSProperties } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiBrain01Icon,
  ArrowRight01Icon,
  KanbanIcon,
  Robot01Icon,
  RocketIcon,
  SquareLock01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import { BrandLogo } from "@/components/brand";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";

import "./hero.css";

const TRUST = [
  "7 AI agents",
  "Greenfield & brownfield",
  "Sprint-0 in minutes",
];

const CHIPS = [
  { icon: Robot01Icon, bg: "oklch(0.701 0.2 6.638)" },
  { icon: KanbanIcon, bg: "oklch(0.709 0.159 293.541)" },
  { icon: AiBrain01Icon, bg: "oklch(0.762 0.154 159.355)" },
  { icon: RocketIcon, bg: "oklch(0.738 0.141 249.011)" },
] as const;

/** The seven AI agents riding the marquee belt behind the fixed core keycap. */
const AGENTS = [
  { id: "AN", color: "oklch(0.701 0.2 6.638)" },
  { id: "PM", color: "oklch(0.817 0.164 75.837)" },
  { id: "AR", color: "oklch(0.709 0.159 293.541)" },
  { id: "SM", color: "oklch(0.762 0.154 159.355)" },
  { id: "DEV", color: "oklch(0.671 0.177 254.495)" },
  { id: "UX", color: "oklch(0.725 0.175 349.761)" },
  { id: "TE", color: "oklch(0.797 0.134 211.53)" },
] as const;

type CardState = "queued" | "active" | "done";

const COLUMNS: {
  label: string;
  dot: string;
  cards: {
    id: string;
    title: string;
    agent: string;
    color: string;
    state: CardState;
  }[];
}[] = [
  {
    label: "Backlog",
    dot: "oklch(0.633 0 0)",
    cards: [
      {
        id: "GIN-04",
        title: "Create PRD",
        agent: "Product Manager",
        color: "oklch(0.817 0.164 75.837)",
        state: "queued",
      },
      {
        id: "GIN-05",
        title: "Design the architecture",
        agent: "Architect",
        color: "oklch(0.709 0.159 293.541)",
        state: "queued",
      },
      {
        id: "GIN-06",
        title: "Extract epics & stories",
        agent: "Scrum Master",
        color: "oklch(0.762 0.154 159.355)",
        state: "queued",
      },
    ],
  },
  {
    label: "In progress",
    dot: "oklch(0.817 0.164 75.837)",
    cards: [
      {
        id: "GIN-03",
        title: "Write Product Brief",
        agent: "Analyst",
        color: "oklch(0.701 0.2 6.638)",
        state: "active",
      },
      {
        id: "GIN-02",
        title: "Research market & domain",
        agent: "Analyst",
        color: "oklch(0.701 0.2 6.638)",
        state: "queued",
      },
    ],
  },
  {
    label: "In review",
    dot: "oklch(0.671 0.177 254.495)",
    cards: [
      {
        id: "GIN-01",
        title: "Brainstorm the idea",
        agent: "Analyst",
        color: "oklch(0.701 0.2 6.638)",
        state: "done",
      },
    ],
  },
];

const delay = (ms: number) => ({ "--lp-delay": `${ms}ms` }) as CSSProperties;

export function Hero() {
  return (
    <section className="lp-hero">
      <div className="lp-frame">
        {/* corner annotations */}
        {/* <div className="mb-10 flex items-start justify-between">
          <div className="lp-rise flex items-center gap-2" style={delay(0)}>
            {CHIPS.map((chip) => (
              <span
                key={chip.bg}
                className="lp-chip"
                style={{ background: chip.bg }}
                aria-hidden
              >
                <HugeiconsIcon icon={chip.icon} className="size-3.5" />
              </span>
            ))}
          </div>
          <p
            className="lp-mono lp-note lp-rise hidden sm:block"
            style={delay(60)}
          >
            Finally, the way projects should be planned.
          </p>
        </div> */}

        <div className="lp-badge lp-mono lp-rise mb-8" style={delay(80)}>
          <span className="relative flex size-1.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[oklch(0.817_0.164_75.837)] opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[oklch(0.817_0.164_75.837)]" />
          </span>
          AI-native project management
        </div>

        <h1 className="lp-display max-w-5xl">
          <span className="lp-rise block" style={delay(140)}>
            <span className="lp-display-outline">Turn ideas into</span>
          </span>
          <span className="lp-rise block" style={delay(220)}>
            Production-ready
          </span>
          <span className="lp-rise flex items-center" style={delay(300)}>
            Software
            <span className="lp-arrow" aria-hidden />
            <span className="lp-display-accent">Now</span>
          </span>
        </h1>

        <div className="mt-9 flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
          <p
            className="lp-rise max-w-xl text-base leading-relaxed text-(--lp-ink-dim)"
            style={delay(380)}
          >
            GigsNano runs greenfield and brownfield projects through a guided
            Sprint-0 — brief, PRD, architecture, epics, and sprint plan — with a
            specialized AI agent on every card.
          </p>

          <div
            className="lp-rise flex flex-wrap items-center gap-4"
            style={delay(440)}
          >
            <Link href="/sign-up" className="lp-key">
              <span className="lp-key__cap">
                <span className="lp-key__dots" aria-hidden />
                <span className="lp-key__label">Get started</span>
                <span className="lp-key__leds" aria-hidden />
              </span>
            </Link>
            <Link href="/marketplace" className="lp-ghost">
              Explore the marketplace
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="lp-ghost__arrow size-4"
                aria-hidden
              />
            </Link>
          </div>
        </div>

        <ul
          className="lp-rise mt-9 flex flex-wrap items-center gap-2.5"
          style={delay(500)}
        >
          {TRUST.map((item) => (
            <li key={item} className="lp-tag lp-mono">
              {item}
            </li>
          ))}
        </ul>

        <div className="lp-hr mt-14" aria-hidden>
          <span className="lp-cross" data-pos="start" />
          <span className="lp-cross" data-pos="end" />
        </div>

        {/* agent conveyor → Sprint-0 board */}
        <ScrollReveal delay={100}>
          <div aria-hidden>
            <div className="lp-belt">
              <div className="lp-belt__rail">
                <div className="lp-belt__window">
                  <div className="lp-belt__track">
                    {/* two identical sequences → seamless -50% → 0 loop */}
                    {(["a", "b"] as const).map((seq) => (
                      <div key={seq} className="lp-belt__seq">
                        {AGENTS.map((agent) => (
                          <span key={agent.id} className="lp-tile">
                            <span
                              className="lp-mono"
                              style={{ color: agent.color }}
                            >
                              {agent.id}
                            </span>
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* outside the rail: its edge-fade mask clips anything that
                  pops above the rail box */}
              <span className="lp-tile lp-tile--core">
                <span>
                  <BrandLogo variant="icon" className="size-[54px]" />
                </span>
              </span>
            </div>

            <div className="lp-flow">
              <span className="lp-flow__stem" />
              <span className="lp-flow__bus" />
              <span className="lp-flow__drop" />
              <span className="lp-flow__drop" />
              <span className="lp-flow__drop" />
            </div>

            <div className="lp-board">
              {COLUMNS.map((col) => (
                <div key={col.label}>
                  <div className="lp-col__head lp-mono">
                    <span
                      className="lp-col__dot"
                      style={{ background: col.dot }}
                    />
                    {col.label}
                    <span className="lp-col__count">
                      {col.cards.length.toString().padStart(2, "0")}
                    </span>
                  </div>
                  {col.cards.map((card) => (
                    <article
                      key={card.id}
                      className={
                        card.state === "active"
                          ? "lp-card lp-card--active"
                          : card.state === "done"
                            ? "lp-card lp-card--done"
                            : "lp-card"
                      }
                    >
                      <div className="lp-card__top lp-mono">
                        {card.id}
                        <span className="lp-card__bot">
                          <HugeiconsIcon
                            icon={Robot01Icon}
                            className="size-3.5"
                          />
                        </span>
                      </div>
                      <p className="lp-card__title">{card.title}</p>
                      <div className="lp-card__meta">
                        <span className="lp-mono" style={{ color: card.color }}>
                          {card.agent}
                        </span>
                        <span className="ml-auto inline-flex items-center gap-1">
                          {card.state === "active" ? (
                            <>
                              <span className="gn-typing-dot size-1 rounded-full bg-[oklch(0.671_0.177_254.495)]" />
                              <span className="gn-typing-dot size-1 rounded-full bg-[oklch(0.671_0.177_254.495)] [animation-delay:150ms]" />
                              <span className="gn-typing-dot size-1 rounded-full bg-[oklch(0.671_0.177_254.495)] [animation-delay:300ms]" />
                            </>
                          ) : card.state === "done" ? (
                            <HugeiconsIcon
                              icon={Tick02Icon}
                              className="size-3.5 text-[oklch(0.762_0.154_159.355)]"
                            />
                          ) : (
                            <HugeiconsIcon
                              icon={SquareLock01Icon}
                              className="size-3.5 text-(--lp-ink-faint)"
                            />
                          )}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>

        <div className="lp-hr mt-14" aria-hidden>
          <span className="lp-cross" data-pos="start" />
          <span className="lp-cross" data-pos="end" />
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="lp-mono lp-note">
            All the planning you need — in one Sprint-0.
          </p>
          <p className="lp-mono lp-note hidden sm:block">
            [ Sprint-0 · AI agents ]
          </p>
        </div>
      </div>
    </section>
  );
}
