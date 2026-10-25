"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useArtifacts, useSetPins } from "@/hooks/project/use-foundation";
import type { IArtifact, IFoundation } from "@/types/project/foundation";

const TYPE_ORDER: IArtifact["artifact_type"][] = ["skill", "design_system", "persona"];
const TYPE_LABELS: Record<IArtifact["artifact_type"], string> = {
  skill: "Skills",
  design_system: "Design systems",
  persona: "Personas",
};

export function FoundationArtifacts({
  workspaceSlug,
  projectId,
  foundation,
}: {
  workspaceSlug: string;
  projectId: string;
  foundation: IFoundation;
}) {
  const { data: artifacts } = useArtifacts(workspaceSlug);
  const setPins = useSetPins(workspaceSlug, projectId);
  const pinned = new Set(foundation.pinned_artifacts);

  const toggle = (id: string) => {
    const next = new Set(pinned);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPins.mutate([...next]);
  };

  if (!artifacts?.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-foreground">Artifact library</h2>
      <p className="text-xs text-muted-foreground">
        Load skills, design systems & personas into this Foundation. Agents and freelancers operate
        under what&rsquo;s pinned.
      </p>
      {TYPE_ORDER.map((type) => {
        const items = artifacts.filter((a) => a.artifact_type === type);
        if (!items.length) return null;
        return (
          <div key={type} className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{TYPE_LABELS[type]}</p>
            <ul className="space-y-1">
              {items.map((a) => (
                <li key={a.id}>
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={pinned.has(a.id)}
                      disabled={setPins.isPending}
                      onCheckedChange={() => toggle(a.id)}
                    />
                    <span>{a.name}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {a.visibility}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
