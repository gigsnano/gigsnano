import {
  Compass01Icon,
  Route01Icon,
  Search01Icon,
  ShieldIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";

import { codebaseAnalytics } from "@/lib/analytics";
import type { CodebaseViewId } from "@/types/code/intelligence";

/** GIN-279 — goal-oriented entry points that turn intent into a preconfigured
 * destination. Extensible through this const alone (add a row, no component change).
 * Query-first journeys (trace a feature, find API usage) hand off to Ask Codebase
 * where the user states the query; the rest jump straight to the right view. */
type QuickPath = {
  id: string;
  label: string;
  description: string;
  icon: IconSvgElement;
} & ({ kind: "view"; view: CodebaseViewId } | { kind: "ask" });

const QUICK_PATHS: QuickPath[] = [
  { id: "architecture", label: "Understand architecture", description: "See how the codebase is organized", icon: Compass01Icon, kind: "view", view: "dependencies" },
  { id: "trace-feature", label: "Trace a feature", description: "Follow a capability across the code", icon: Route01Icon, kind: "ask" },
  { id: "find-api", label: "Find API usage", description: "Locate where an endpoint is used", icon: Search01Icon, kind: "ask" },
  { id: "review-risks", label: "Review risks", description: "Triage findings and hotspots", icon: ShieldIcon, kind: "view", view: "issues" },
  { id: "onboard", label: "Onboard developer", description: "A grounded tour of the repo", icon: UserGroupIcon, kind: "ask" },
];

export function CodebaseQuickPaths({
  projectId,
  onOpenView,
  onAsk,
}: {
  projectId: string;
  onOpenView: (view: CodebaseViewId) => void;
  onAsk: () => void;
}) {
  function select(p: QuickPath) {
    codebaseAnalytics.quickPath(projectId, p.id);
    if (p.kind === "view") onOpenView(p.view);
    else onAsk();
  }
  return (
    <nav aria-label="Quick paths" className="gn-dash-card" style={{ ["--i" as string]: 6 }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {QUICK_PATHS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => select(p)}
            className="flex flex-col gap-1.5 rounded-xl border bg-card p-3 text-left outline-none transition-all hover:border-foreground/20 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
          >
            <HugeiconsIcon icon={p.icon} className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium leading-tight">{p.label}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">{p.description}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
