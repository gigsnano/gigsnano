import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import type { IRecurrence, ITemplate, ITemplateDraft } from "@/types";

describe("template mock handlers", () => {
  it("lists templates and filters by kind", async () => {
    const all = await resolveMock<ITemplate[]>("GET", "/workspaces/acme/templates/");
    expect(all.length).toBeGreaterThan(0);
    const work = await resolveMock<ITemplate[]>("GET", "/workspaces/acme/templates/?kind=work_item");
    expect(work.every((t) => t.kind === "work_item")).toBe(true);
  });

  it("drafts then creates a work-item template", async () => {
    const draft = await resolveMock<ITemplateDraft>("POST", "/workspaces/acme/templates/draft/", {
      text: "weekly report",
    });
    expect(draft.kind).toBe("work_item");
    const created = await resolveMock<ITemplate>("POST", "/workspaces/acme/templates/", {
      kind: "work_item",
      name: draft.name,
      content: draft.content,
    });
    expect(created.id).toBeTruthy();
  });

  it("applies a work-item template into a project", async () => {
    const res = await resolveMock<{ story_id: string }>(
      "POST",
      "/workspaces/acme/projects/prj_mba/templates/tpl_bug/apply/",
      {},
    );
    expect(res.story_id).toBeTruthy();
  });

  it("creates a recurrence and pauses it via the automation rule", async () => {
    const rec = await resolveMock<IRecurrence>(
      "POST",
      "/workspaces/acme/projects/prj_mba/recurrences/",
      { template_id: "tpl_weekly", every: 1, unit: "days" },
    );
    expect(rec.every).toBe(1);
    expect(rec.next_run_at).toBeTruthy();

    const list = await resolveMock<IRecurrence[]>("GET", "/workspaces/acme/projects/prj_mba/recurrences/");
    expect(list.some((r) => r.id === rec.id)).toBe(true);

    // Pause = PATCH the underlying automation rule (recurrence id = rule id).
    await resolveMock("PATCH", `/workspaces/acme/projects/prj_mba/automation-rules/${rec.id}/`, {
      enabled: false,
    });
    const after = await resolveMock<IRecurrence[]>("GET", "/workspaces/acme/projects/prj_mba/recurrences/");
    expect(after.find((r) => r.id === rec.id)?.enabled).toBe(false);
  });
});
