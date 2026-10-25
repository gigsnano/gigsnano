import { describe, expect, it } from "vitest";

import { EBlueprintLifecycle } from "@/types/solution/blueprint";

import {
  BLUEPRINT_FIXTURES,
  canStartInstall,
  digestBlueprint,
  serializeBlueprint,
  softwareDeliveryBlueprint,
  validateBlueprint,
} from "./index";

describe("blueprint digest", () => {
  it("is stable for the same definition regardless of key order", () => {
    const a = digestBlueprint(softwareDeliveryBlueprint);
    const shuffled = {
      ...softwareDeliveryBlueprint,
      identity: { ...softwareDeliveryBlueprint.identity },
    };
    // Re-assign identity fields in a different insertion order.
    const identity = {
      version: shuffled.identity.version,
      key: shuffled.identity.key,
      solution_version_min: shuffled.identity.solution_version_min,
      name: shuffled.identity.name,
      description: shuffled.identity.description,
      solution_key: shuffled.identity.solution_key,
    };
    const b = digestBlueprint({ ...shuffled, identity });
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it("canonical serialization matches for fixtures", () => {
    for (const fixture of BLUEPRINT_FIXTURES) {
      expect(serializeBlueprint(fixture)).toBe(serializeBlueprint(fixture));
      expect(validateBlueprint(fixture).ok).toBe(true);
      expect(validateBlueprint(fixture).digest).toBe(digestBlueprint(fixture));
    }
  });
});

describe("validateBlueprint", () => {
  it("rejects circular work dependencies", () => {
    const cyclic = {
      ...softwareDeliveryBlueprint,
      work_graph: [
        { key: "a", label: "A", depends_on: ["b"] },
        { key: "b", label: "B", depends_on: ["a"] },
      ],
    };
    const result = validateBlueprint(cyclic);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "circular_dependency")).toBe(true);
  });

  it("rejects unknown work refs", () => {
    const bad = {
      ...softwareDeliveryBlueprint,
      work_graph: [{ key: "a", label: "A", depends_on: ["missing"] }],
    };
    const result = validateBlueprint(bad);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "unknown_ref")).toBe(true);
  });

  it("rejects credential-shaped fields", () => {
    const dirty = {
      ...softwareDeliveryBlueprint,
      parameters: [
        {
          key: "api_token",
          label: "Token",
          required: false,
          value_type: "string" as const,
          default: "secret",
        },
      ],
    };
    const result = validateBlueprint(dirty);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "forbidden_credential")).toBe(true);
  });

  it("blocks new installs of revoked blueprints", () => {
    const revoked = {
      ...softwareDeliveryBlueprint,
      lifecycle: EBlueprintLifecycle.Revoked,
    };
    expect(validateBlueprint(revoked).ok).toBe(true);
    expect(canStartInstall(revoked)).toBe(false);
  });

  it("blocks draft installs", () => {
    const draft = {
      ...softwareDeliveryBlueprint,
      lifecycle: EBlueprintLifecycle.Draft,
    };
    expect(canStartInstall(draft)).toBe(false);
  });
});
