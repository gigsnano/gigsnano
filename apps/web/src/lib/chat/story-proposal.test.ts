import { describe, expect, it } from "vitest";
import { parseStoryProposals, stripStoryProposals } from "./story-proposal";
import { EStoryType } from "@/types";

const VALID_BLOCK =
  'Here\'s a draft — review and create it:\n\n' +
  "```gigs:story\n" +
  '{"title": "Add SSO login", "type": "feature", "description": "Support SAML SSO."}\n' +
  "```";

describe("parseStoryProposals", () => {
  it("extracts one valid block with the right fields", () => {
    const proposals = parseStoryProposals(VALID_BLOCK);
    expect(proposals).toEqual([
      { title: "Add SSO login", type: EStoryType.Feature, description: "Support SAML SSO." },
    ]);
  });

  it("returns [] for invalid JSON inside the block", () => {
    const text = "```gigs:story\n{not json}\n```";
    expect(parseStoryProposals(text)).toEqual([]);
  });

  it("returns [] when there is no block", () => {
    expect(parseStoryProposals("Just a normal reply, no proposal here.")).toEqual([]);
  });

  it("defaults to story type when type is missing or invalid", () => {
    const text = '```gigs:story\n{"title": "Fix bug"}\n```';
    expect(parseStoryProposals(text)).toEqual([
      { title: "Fix bug", type: EStoryType.Story, description: "" },
    ]);
  });

  it("skips a block with no title", () => {
    const text = '```gigs:story\n{"description": "no title here"}\n```';
    expect(parseStoryProposals(text)).toEqual([]);
  });
});

describe("stripStoryProposals", () => {
  it("removes the block and leaves surrounding prose", () => {
    const stripped = stripStoryProposals(VALID_BLOCK);
    expect(stripped).toBe("Here's a draft — review and create it:");
    expect(stripped).not.toContain("gigs:story");
  });

  it("is a no-op when there is no block", () => {
    expect(stripStoryProposals("Plain text")).toBe("Plain text");
  });
});
