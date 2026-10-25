"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calculator01Icon } from "@hugeicons/core-free-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { useProjectEstimates } from "@/hooks/project/use-project-settings";
import type { IProjectEstimate } from "@/types";

const POINT_VALUES = [1, 2, 3, 5, 8, 13, 21];
const HOUR_VALUES = [1, 2, 4, 8, 16, 24, 40];
const DAY_VALUES = [0.5, 1, 2, 3, 5, 8];

function valuesForType(type: IProjectEstimate["type"]): number[] {
  if (type === "hours") return HOUR_VALUES;
  if (type === "days") return DAY_VALUES;
  return POINT_VALUES;
}

function formatPoints(points: number, type: IProjectEstimate["type"]): string {
  if (type === "hours") return `${points}h`;
  if (type === "days") return `${points}d`;
  return String(points);
}

export function EstimateField({ workspaceSlug, projectId, value, onChange }: {
  workspaceSlug: string;
  projectId: string;
  value: { estimateId: string | null; points: number | null };
  onChange: (estimateId: string | null, points: number | null) => void;
}) {
  const { data: estimates } = useProjectEstimates(workspaceSlug, projectId);
  const scales = estimates ?? [];
  const activeScale = scales.find((e) => e.id === value.estimateId);
  const current =
    value.estimateId && value.points != null && activeScale
      ? { scale: activeScale, points: value.points }
      : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PropertyPill
          active={!!current}
          icon={<HugeiconsIcon icon={Calculator01Icon} className="size-3.5" />}
        >
          {current ? formatPoints(current.points, current.scale.type) : "Estimate"}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(null, null)}>
          <span className="flex-1 text-muted-foreground">No estimate</span>
        </DropdownMenuItem>
        {scales.map((scale) =>
          valuesForType(scale.type).map((pts) => (
            <DropdownMenuItem key={`${scale.id}-${pts}`} onSelect={() => onChange(scale.id, pts)}>
              <span className="flex-1 truncate">{scale.name}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {formatPoints(pts, scale.type)}
              </span>
            </DropdownMenuItem>
          )),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
