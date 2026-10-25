import type { IBriefingProject } from "../types/briefing";
import { isAtRisk, type TTone } from "./health";

export interface IHeadlineSegment {
  text: string;
  tone: TTone;
}

/** The sentence that leads Today: built from counts, never generated. */
export function buildHeadline(input: {
  projects: Pick<IBriefingProject, "health">[];
  needsYou: number;
}): IHeadlineSegment[] {
  const count = input.projects.length;
  if (count === 0) return [{ text: "No projects yet.", tone: "default" }];

  const segments: IHeadlineSegment[] = [
    { text: `${count} ${count === 1 ? "project" : "projects"} moving.`, tone: "default" },
  ];
  const atRisk = input.projects.filter((p) => isAtRisk(p.health)).length;
  if (atRisk > 0) segments.push({ text: `${atRisk} at risk.`, tone: "warning" });
  segments.push(
    input.needsYou > 0
      ? { text: `${input.needsYou} ${input.needsYou === 1 ? "needs" : "need"} you.`, tone: "primary" }
      : { text: "Nothing needs you.", tone: "default" },
  );
  return segments;
}
