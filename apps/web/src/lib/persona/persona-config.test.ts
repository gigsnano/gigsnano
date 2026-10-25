import { describe, expect, it } from "vitest";

import { EWorkspaceRole } from "@/types";

import {
  EPersonaRole,
  PERSONA_CONFIG,
  isPersonaRole,
  personaAllowed,
} from "./persona-config";

describe("persona config", () => {
  it("recognizes valid persona roles", () => {
    expect(isPersonaRole("manager")).toBe(true);
    expect(isPersonaRole("developer")).toBe(true);
    expect(isPersonaRole("nope")).toBe(false);
  });

  it("gates the Manager lens to Admin+ but leaves others open", () => {
    const manager = PERSONA_CONFIG[EPersonaRole.Manager];
    const dev = PERSONA_CONFIG[EPersonaRole.Developer];

    expect(personaAllowed(manager, EWorkspaceRole.Owner)).toBe(true);
    expect(personaAllowed(manager, EWorkspaceRole.Admin)).toBe(true);
    expect(personaAllowed(manager, EWorkspaceRole.Member)).toBe(false);
    expect(personaAllowed(manager, null)).toBe(false);

    // No minRole → open to any member, even before the role resolves.
    expect(personaAllowed(dev, EWorkspaceRole.Member)).toBe(true);
    expect(personaAllowed(dev, null)).toBe(true);
  });
});
