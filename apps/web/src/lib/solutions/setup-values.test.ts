import { describe, expect, it } from "vitest";

import { EProjectFlow } from "@/types";
import { makeEmptyDraft } from "@/lib/projects/create-project-draft";

import { draftFromValues, softwareDeliveryValues } from "./setup-values";

const filled = {
  ...makeEmptyDraft(),
  name: "Mobile Banking App",
  identifier: "MBA",
  idEdited: true,
  description: "Retail banking client",
  hasUi: false,
  logoImageUrl: "https://cdn.example.com/logo.png",
};

describe("softwareDeliveryValues / draftFromValues", () => {
  it("round-trips a filled form without losing a field", () => {
    expect(draftFromValues(softwareDeliveryValues(filled))).toEqual(filled);
  });

  it("round-trips a brownfield form with its repository", () => {
    const brownfield = {
      ...filled,
      flow: EProjectFlow.Existing,
      repoFullName: "acme/payments-api",
    };
    expect(draftFromValues(softwareDeliveryValues(brownfield))).toEqual(brownfield);
  });

  it("uses the API's field names so the backend can map values onto a create payload", () => {
    expect(softwareDeliveryValues(filled)).toMatchObject({
      has_ui: false,
      cover_image_url: filled.coverUrl,
      logo_emoji: filled.emoji,
      logo_image_url: filled.logoImageUrl,
      identifier_edited: true,
    });
  });
});

describe("draftFromValues", () => {
  it("returns null for a draft that was never typed into", () => {
    expect(draftFromValues({})).toBeNull();
    expect(draftFromValues(null)).toBeNull();
  });

  it("seeds the flow from the starting point when the blob predates it", () => {
    const restored = draftFromValues({ name: "Legacy" }, EProjectFlow.Existing);
    expect(restored).toMatchObject({ name: "Legacy", flow: EProjectFlow.Existing });
  });

  it("defaults mistyped fields instead of trusting the stored blob", () => {
    const restored = draftFromValues({
      name: 42,
      has_ui: "yes",
      flow: "sideways",
      logo_image_url: { url: "nope" },
    });
    expect(restored).toEqual(makeEmptyDraft());
  });
});
