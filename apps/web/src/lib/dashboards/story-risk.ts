import { EStoryPriority, EStoryStatus, type IStory } from "@/types";

export type TRiskLevel = "overdue" | "high";

export interface IStoryRisk {
  level: TRiskLevel;
  /** Short reason shown on the risk chip. */
  reason: string;
  /** Sort weight — higher surfaces first (overdue by days, then priority). */
  weight: number;
}

const DAY = 86_400_000;

/**
 * Classify an open work item's delivery risk (GIN-89 risk list). Overdue = past
 * its target date and not done; otherwise urgent/high-priority open items. Done
 * items and on-track work return null. Pure so a widget + a test share it.
 */
export function storyRisk(story: IStory, today: Date): IStoryRisk | null {
  if (story.status === EStoryStatus.Done) return null;

  if (story.target_date) {
    const days = Math.floor((today.getTime() - new Date(`${story.target_date}T00:00:00`).getTime()) / DAY);
    if (days > 0) {
      return { level: "overdue", reason: `${days}d overdue`, weight: 1000 + days };
    }
  }

  if (story.priority === EStoryPriority.Urgent) {
    return { level: "high", reason: "Urgent", weight: 20 };
  }
  if (story.priority === EStoryPriority.High) {
    return { level: "high", reason: "High priority", weight: 10 };
  }
  return null;
}
