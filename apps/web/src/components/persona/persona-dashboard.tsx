"use client";

import { EmptyState } from "@/components/empty-state";
import { EPersonaRole, type IPersonaDef } from "@/lib/persona/persona-config";

import { ArchitectHub } from "./architect-hub";
import { PersonaWidgetCard } from "./persona-widget-card";

/** Renders a persona's curated widget composition, or a placeholder for lenses
 * whose board isn't built yet (P1–P3). */
export function PersonaDashboard({
  workspaceSlug,
  def,
}: {
  workspaceSlug: string;
  def: IPersonaDef;
}) {
  // Architect is a project-scoped hub (routes to the real Codebase views), not a
  // workspace widget composition.
  if (def.role === EPersonaRole.Architect) {
    return <ArchitectHub workspaceSlug={workspaceSlug} />;
  }

  if (!def.widgets) {
    return (
      <EmptyState
        assetKey="generic"
        align="start"
        title={`${def.label} lens is on the way`}
        description={`This persona board ships in ${def.pendingTicket ?? "a later phase"}, composed from the shared insight widgets over the Context Engine.`}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {def.widgets.map((w, i) => (
        <PersonaWidgetCard
          key={`${w.type}-${w.title}`}
          workspaceSlug={workspaceSlug}
          widget={w}
          index={i}
        />
      ))}
    </div>
  );
}
