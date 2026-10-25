import type { ReactElement } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import { MARKETING_SHOWCASES, type ShowcaseMock } from "@/constants/marketing";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { cn } from "@/lib/utils";
import { AgentChatMock } from "./mockups/agent-chat-mock";
import { WorkItemsMock } from "./mockups/work-items-mock";
import { MarketplaceMock } from "./mockups/marketplace-mock";

const MOCKS: Record<ShowcaseMock, () => ReactElement> = {
  agents: AgentChatMock,
  workItems: WorkItemsMock,
  marketplace: MarketplaceMock,
};

/**
 * Alternating product showcases on the shared blueprint sheet: each row pairs a
 * text block with a themed "app window" that recreates a real GigsNano surface
 * (agent chat, work items, marketplace) minimally in the landing tokens.
 */
export function ProductShowcases() {
  return (
    <section id="product" className="relative scroll-mt-24">
      <div className="lp-frame">
        <span className="lp-cross" data-pos="start" aria-hidden />
        <span className="lp-cross" data-pos="end" aria-hidden />

        {MARKETING_SHOWCASES.map((showcase) => {
          const Mock = MOCKS[showcase.mock];
          return (
            <div
              key={showcase.title}
              className={cn("lp-showcase", showcase.flip && "lp-showcase--flip")}
            >
              <ScrollReveal className="lp-showcase__text">
                <p className="lp-eyebrow lp-mono">{showcase.eyebrow}</p>
                <h3 className="lp-showcase__title">{showcase.title}</h3>
                <p className="lp-showcase__body">{showcase.body}</p>
                <ul className="lp-showcase__bullets">
                  {showcase.bullets.map((bullet) => (
                    <li key={bullet} className="lp-showcase__bullet">
                      <span className="lp-showcase__check">
                        <HugeiconsIcon icon={Tick02Icon} className="size-3" aria-hidden />
                      </span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </ScrollReveal>

              <ScrollReveal delay={100}>
                <Mock />
              </ScrollReveal>
            </div>
          );
        })}
      </div>
    </section>
  );
}
