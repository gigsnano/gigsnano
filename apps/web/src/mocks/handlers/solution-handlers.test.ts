import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import { APIError } from "@/services/api-error";
import { ESolutionAvailability, ESolutionKey, type ISetupDraft, type ISolutionRegistry } from "@/types";
import { SETUP_DRAFT_STEP } from "@/lib/solutions/setup-flow";
import { validateSolutionRegistry } from "@/lib/solutions/registry";

const createDraft = (solutionKey: string, startingPoint: string | null = "idea") =>
  resolveMock<ISetupDraft>("POST", "/workspaces/acme/setup-drafts/", {
    solution_key: solutionKey,
    starting_point: startingPoint,
  });

describe("solution registry mock handler", () => {
  it("serves both built-in solutions, and they are structurally valid", async () => {
    const registry = await resolveMock<ISolutionRegistry>("GET", "/workspaces/acme/solutions/");
    expect(registry.solutions.map((s) => s.key)).toEqual([
      ESolutionKey.SoftwareDelivery,
      ESolutionKey.RevenueAssurance,
    ]);
    expect(validateSolutionRegistry(registry)).toEqual([]);
  });

  it("carries a revision so definition caches can be invalidated", async () => {
    const registry = await resolveMock<ISolutionRegistry>("GET", "/workspaces/acme/solutions/");
    expect(registry.revision).toMatch(/\d/);
  });

  it("describes Revenue Assurance as a gated pilot with a reason to show", async () => {
    const registry = await resolveMock<ISolutionRegistry>("GET", "/workspaces/acme/solutions/");
    const ra = registry.solutions.find((s) => s.key === ESolutionKey.RevenueAssurance)!;
    expect(ra.availability).toBe(ESolutionAvailability.Disabled);
    expect(ra.availability_reason).toBeTruthy();
  });

  it("gives Revenue Assurance no repository capability, so it needs no repo fields", async () => {
    const registry = await resolveMock<ISolutionRegistry>("GET", "/workspaces/acme/solutions/");
    const ra = registry.solutions.find((s) => s.key === ESolutionKey.RevenueAssurance)!;
    expect(ra.capabilities).not.toContain("repositories");
  });
});

describe("setup draft mock handlers", () => {
  it("creates a draft that resumes at the solution's setup step", async () => {
    const draft = await createDraft(ESolutionKey.SoftwareDelivery);
    expect(draft.solution_key).toBe(ESolutionKey.SoftwareDelivery);
    expect(draft.step).toBe(SETUP_DRAFT_STEP);
    expect(draft.starting_point).toBe("idea");
    expect(draft.revision).toBe(1);
    expect(Date.parse(draft.expires_at)).toBeGreaterThan(Date.parse(draft.created_at));
  });

  it("refuses to start a draft for a solution the workspace has switched off", async () => {
    await expect(createDraft(ESolutionKey.RevenueAssurance)).rejects.toMatchObject({
      status: 422,
    });
  });

  it("refuses an unknown solution key with an actionable message", async () => {
    await expect(createDraft("business")).rejects.toThrow(/Unknown solution "business"/);
  });

  it("lists the draft it just created", async () => {
    const draft = await createDraft(ESolutionKey.SoftwareDelivery);
    const list = await resolveMock<ISetupDraft[]>("GET", "/workspaces/acme/setup-drafts/");
    expect(list.map((d) => d.id)).toContain(draft.id);
  });

  it("does not leak drafts into another workspace", async () => {
    const draft = await createDraft(ESolutionKey.SoftwareDelivery);
    const other = await resolveMock<ISetupDraft[]>("GET", "/workspaces/other/setup-drafts/");
    expect(other.map((d) => d.id)).not.toContain(draft.id);
  });

  it("advances the revision on each accepted write", async () => {
    const draft = await createDraft(ESolutionKey.SoftwareDelivery);
    const updated = await resolveMock<ISetupDraft>(
      "PATCH",
      `/workspaces/acme/setup-drafts/${draft.id}/`,
      { revision: draft.revision, values: { name: "Ledger" } },
    );
    expect(updated.revision).toBe(draft.revision + 1);
    expect(updated.values).toEqual({ name: "Ledger" });
  });

  it("rejects a stale write with a conflict instead of overwriting another device", async () => {
    const draft = await createDraft(ESolutionKey.SoftwareDelivery);
    await resolveMock<ISetupDraft>("PATCH", `/workspaces/acme/setup-drafts/${draft.id}/`, {
      revision: draft.revision,
      values: { name: "From device A" },
    });

    // Device B still holds the original revision.
    const conflict = await resolveMock<ISetupDraft>(
      "PATCH",
      `/workspaces/acme/setup-drafts/${draft.id}/`,
      { revision: draft.revision, values: { name: "From device B" } },
    ).catch((error: unknown) => error);

    expect(conflict).toBeInstanceOf(APIError);
    expect((conflict as APIError).status).toBe(409);

    const list = await resolveMock<ISetupDraft[]>("GET", "/workspaces/acme/setup-drafts/");
    expect(list.find((d) => d.id === draft.id)?.values).toEqual({ name: "From device A" });
  });

  it("discards a draft", async () => {
    const draft = await createDraft(ESolutionKey.SoftwareDelivery);
    await resolveMock("DELETE", `/workspaces/acme/setup-drafts/${draft.id}/`);
    const list = await resolveMock<ISetupDraft[]>("GET", "/workspaces/acme/setup-drafts/");
    expect(list.map((d) => d.id)).not.toContain(draft.id);
  });

  it("404s a draft that does not exist", async () => {
    await expect(
      resolveMock("PATCH", "/workspaces/acme/setup-drafts/nope/", { revision: 1 }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
