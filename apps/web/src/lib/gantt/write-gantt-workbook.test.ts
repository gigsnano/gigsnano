import { describe, expect, it } from "vitest";

import { EGanttZoom } from "@/components/projects/views/gantt/gantt-config";
import { addDays, formatISODate } from "@/components/projects/views/gantt/gantt-date-math";
import { EStoryStatus, type IStory } from "@/types";
import { buildGanttExportModel } from "./gantt-export-model";
import { buildGanttWorkbook } from "./write-gantt-workbook";

function isoFromToday(days: number): string {
  const n = new Date();
  const base = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  return formatISODate(addDays(base, days));
}

const story: IStory = {
  id: "1", workspace_slug: "ws", project_id: "p", cycle_id: null, module_id: null,
  parent_id: null, title: "Ship export", description: "", status: EStoryStatus.InProgress,
  priority: "high" as IStory["priority"], start_date: isoFromToday(0), target_date: isoFromToday(4),
  order: 0, assignee_id: null, ai_agent_id: null, label_id: null, label_ids: [], estimate_id: null,
  estimate_points: null, sub_issue_count: 0, bmad: null, created_at: "2026-01-01", updated_at: "2026-01-01",
};

describe("buildGanttWorkbook", () => {
  it("produces a non-empty .xlsx (zip magic bytes) without throwing", async () => {
    const model = buildGanttExportModel({
      stories: [story],
      zoom: EGanttZoom.Week,
      getAssigneeName: () => "",
      getCode: (s) => `WEB-${s.id}`,
    });
    const buffer = await buildGanttWorkbook(model, "Demo — Gantt");
    const bytes = new Uint8Array(buffer);
    expect(bytes.length).toBeGreaterThan(1000);
    // .xlsx is a zip: first two bytes are "PK".
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
