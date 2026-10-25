import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import { APIError } from "@/services/api-error";
import type { ITriageItem } from "@/types";

import { classifyTriage, combineTriagePriority } from "./intake-handlers";

describe("intake pure helpers", () => {
  it("classifies by keyword", () => {
    expect(classifyTriage("Payment fails on retry").task_type).toBe("bug");
    expect(classifyTriage("Add CSV export").task_type).toBe("feature");
    expect(classifyTriage("Rework onboarding copy").task_type).toBe("story");
  });

  it("floors priority at the customer weight", () => {
    // A bland request from a strategic customer (weight 2) still lands High.
    expect(combineTriagePriority("tweak the footer", 2)).toBe("high");
    // A payment failure outranks a zero-weight floor.
    expect(combineTriagePriority("payment fails", 0)).toBe("high");
    expect(combineTriagePriority("outage everywhere", 0)).toBe("urgent");
  });
});

describe("intake queue mock flow", () => {
  it("only lists new + triaged items", async () => {
    const q = await resolveMock<ITriageItem[]>("GET", "/workspaces/acme/triage/");
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((i) => i.status === "new" || i.status === "triaged")).toBe(true);
  });

  it("process moves a New item to Triaged with a recommendation", async () => {
    const item = await resolveMock<ITriageItem>(
      "POST",
      "/workspaces/acme/triage/tri_3/process/",
    );
    expect(item.status).toBe("triaged");
    expect(item.priority).toBeTruthy();
    expect((item.recommended_route as { persona_id: string }).persona_id).toBeTruthy();
  });

  it("mints a share link and public submit lands in the queue", async () => {
    const link = await resolveMock<{ token: string; url: string }>(
      "POST",
      "/workspaces/acme/intake-link/",
      {},
    );
    expect(link.token).toBe("intake-acme");

    const before = await resolveMock<ITriageItem[]>("GET", "/workspaces/acme/triage/");
    await resolveMock("POST", `/public/intake/${link.token}/`, {
      title: "Public bug report",
      email: "ext@x.com",
    });
    const after = await resolveMock<ITriageItem[]>("GET", "/workspaces/acme/triage/");
    expect(after.length).toBe(before.length + 1);
    expect(after.some((i) => i.title === "Public bug report" && i.source === "public_form")).toBe(
      true,
    );
  });

  it("rejects a public submit with a malformed token", async () => {
    await expect(
      resolveMock("POST", "/public/intake/bogus/", { title: "x" }),
    ).rejects.toMatchObject({ status: 404 } satisfies Partial<APIError>);
  });

  it("accept requires a project, then publishes a story", async () => {
    // tri_3 has no project → 400 without one.
    await expect(
      resolveMock("POST", "/workspaces/acme/triage/tri_3/accept/", {}),
    ).rejects.toMatchObject({ status: 400 } satisfies Partial<APIError>);

    const accepted = await resolveMock<ITriageItem>(
      "POST",
      "/workspaces/acme/triage/tri_3/accept/",
      { project_id: "prj_mba", route: "persona" },
    );
    expect(accepted.status).toBe("accepted");
    expect(accepted.created_story_id).toBeTruthy();

    // Accepted items drop out of the queue.
    const q = await resolveMock<ITriageItem[]>("GET", "/workspaces/acme/triage/");
    expect(q.find((i) => i.id === "tri_3")).toBeUndefined();
  });
});
