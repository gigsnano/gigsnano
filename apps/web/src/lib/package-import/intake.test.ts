import { describe, expect, it } from "vitest";

import { EFindingStatus, EParseState, type IPackageDocument, type IPackageFinding } from "@/types";

import {
  blockingCount,
  effectiveStatus,
  effectiveTitle,
  formatBytes,
  groupFindings,
  isTextFile,
  needsAttention,
  nextAction,
  parseStateLabel,
  readiness,
} from "./intake";

const doc = (over: Partial<IPackageDocument> = {}): IPackageDocument => ({
  id: "d1",
  title: "spec.md",
  file_name: "spec.md",
  mime_type: "text/markdown",
  original_path: "docs/spec.md",
  parse_state: EParseState.Ok,
  parse_error: null,
  byte_size: 1024,
  checksum: "abc",
  canonical: false,
  ...over,
});

const finding = (over: Partial<IPackageFinding> = {}): IPackageFinding => ({
  id: "f1",
  document_id: "d1",
  kind: "decision",
  status: EFindingStatus.Proposed,
  title: "Stack is React Native",
  detail: "",
  confidence: 0.9,
  anchor: "Spec > Architecture",
  anchor_start: 10,
  anchor_end: 90,
  source_excerpt: "The stack is React Native.",
  override: null,
  ...over,
});

describe("isTextFile", () => {
  it("treats markdown and text mime types as text", () => {
    expect(isTextFile("spec.md", "text/markdown")).toBe(true);
    expect(isTextFile("notes.txt", "")).toBe(true);
    expect(isTextFile("data.json", "application/json")).toBe(true);
  });

  it("treats binaries as needing base64, so the server extractor sees real bytes", () => {
    expect(isTextFile("spec.pdf", "application/pdf")).toBe(false);
    expect(isTextFile("package.zip", "application/zip")).toBe(false);
  });
});

describe("parse state", () => {
  it("only ok is ready", () => {
    expect(needsAttention(doc())).toBe(false);
    expect(needsAttention(doc({ parse_state: EParseState.Duplicate }))).toBe(true);
  });

  it("gives every state a readable reason", () => {
    for (const state of Object.values(EParseState)) {
      expect(parseStateLabel(doc({ parse_state: state }))).not.toBe("Unknown");
    }
  });
});

describe("effective status", () => {
  it("prefers a user override over the AI proposal", () => {
    const overridden = finding({
      status: EFindingStatus.Assumption,
      override: { status: EFindingStatus.Approved },
    });
    expect(effectiveStatus(overridden)).toBe(EFindingStatus.Approved);
    // ...and the original is still intact underneath.
    expect(overridden.status).toBe(EFindingStatus.Assumption);
  });

  it("falls back to the AI status when nothing was overridden", () => {
    expect(effectiveStatus(finding())).toBe(EFindingStatus.Proposed);
  });

  it("applies the same rule to the title", () => {
    expect(effectiveTitle(finding({ override: { title: "Corrected" } }))).toBe("Corrected");
    expect(effectiveTitle(finding())).toBe("Stack is React Native");
  });
});

describe("blockingCount", () => {
  it("counts conflicts, including ones a user turned into conflicts", () => {
    expect(
      blockingCount([
        finding({ id: "a", status: EFindingStatus.Conflict }),
        finding({ id: "b", override: { status: EFindingStatus.Conflict } }),
        finding({ id: "c" }),
      ]),
    ).toBe(2);
  });

  it("stops counting one a user resolved", () => {
    expect(
      blockingCount([
        finding({ status: EFindingStatus.Conflict, override: { status: EFindingStatus.Approved } }),
      ]),
    ).toBe(0);
  });
});

describe("groupFindings", () => {
  it("orders groups predictably so the page does not reshuffle", () => {
    const groups = groupFindings([
      finding({ id: "1", kind: "task" }),
      finding({ id: "2", kind: "decision" }),
      finding({ id: "3", kind: "phase" }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["decision", "phase", "task"]);
    expect(groups[0].label).toBe("Decisions");
  });

  it("keeps an unknown kind rather than dropping it", () => {
    const groups = groupFindings([finding({ kind: "surprise_kind" })]);
    expect(groups.at(-1)?.kind).toBe("surprise_kind");
    expect(groups.at(-1)?.label).toBe("surprise kind");
  });
});

describe("formatBytes", () => {
  it("scales the unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatBytes(null)).toBe("");
  });
});

describe("readiness", () => {
  const base = {
    documentsTotal: 4,
    documentsReady: 4,
    findings: [finding()],
    planChangeCount: 10,
    approvedChangeCount: 10,
    repositoryConnected: true,
  };

  it("is 100 only when every factor is satisfied", () => {
    expect(readiness(base).score).toBe(100);
  });

  it("attributes every point to a factor the user can act on", () => {
    const result = readiness(base);
    expect(result.factors.reduce((s, f) => s + f.earned, 0)).toBe(result.score);
    expect(result.factors.reduce((s, f) => s + f.weight, 0)).toBe(100);
    // Each factor explains itself — a bare number would not tell you what to fix.
    expect(result.factors.every((f) => f.detail.length > 0)).toBe(true);
  });

  it("zeroes the conflict factor and lists the blocker", () => {
    const result = readiness({
      ...base,
      findings: [finding({ status: EFindingStatus.Conflict, title: "Two stacks named" })],
    });
    expect(result.score).toBe(75);
    expect(result.blocked).toEqual(["Conflict: Two stacks named"]);
  });

  it("scales partial document and approval progress", () => {
    const result = readiness({
      ...base,
      documentsReady: 2,
      approvedChangeCount: 5,
    });
    // 13 (half of 25, rounded) + 20 findings + 25 no-conflicts + 10 half-approved + 10 repo
    expect(result.score).toBe(78);
  });

  it("separates assumptions from blockers", () => {
    const result = readiness({
      ...base,
      findings: [finding({ status: EFindingStatus.Assumption, title: "Odoo field names" })],
    });
    expect(result.needsConfirmation).toEqual(["Assumption: Odoo field names"]);
    expect(result.blocked).toEqual([]);
  });

  it("survives an empty package without dividing by zero", () => {
    const result = readiness({
      documentsTotal: 0,
      documentsReady: 0,
      findings: [],
      planChangeCount: 0,
      approvedChangeCount: 0,
      repositoryConnected: false,
    });
    expect(result.score).toBe(25); // only "no conflicts" holds, vacuously
    expect(Number.isNaN(result.score)).toBe(false);
  });
});

describe("nextAction", () => {
  const base = {
    hasPackage: true,
    hasFindings: true,
    conflicts: 0,
    hasPlan: true,
    approvedChanges: 5,
    applied: false,
  };

  it("names one action, in the order the flow actually blocks", () => {
    expect(nextAction({ ...base, hasPackage: false })).toMatch(/Upload/);
    expect(nextAction({ ...base, hasFindings: false })).toMatch(/Analyse/);
    expect(nextAction({ ...base, conflicts: 2 })).toMatch(/Resolve 2 conflicting/);
    expect(nextAction({ ...base, hasPlan: false })).toMatch(/planning strategy/);
    expect(nextAction({ ...base, approvedChanges: 0 })).toMatch(/approve/i);
    expect(nextAction(base)).toMatch(/Create the execution plan/);
    expect(nextAction({ ...base, applied: true })).toMatch(/first cycle/);
  });

  it("puts conflicts ahead of everything else", () => {
    // Even with a plan ready to apply, a contradiction comes first.
    expect(nextAction({ ...base, conflicts: 1, approvedChanges: 99 })).toMatch(/Resolve 1/);
  });
});

describe("after an import has been applied", () => {
  // Caught by driving the real app, not by these tests: applying rewrites each
  // change's status, so a count of only "approved" collapses to zero and the
  // summary told the user to go approve something they had already imported.
  it("recommends opening the work items, not approving again", () => {
    expect(
      nextAction({
        hasPackage: true,
        hasFindings: true,
        conflicts: 0,
        hasPlan: true,
        approvedChanges: 0, // every change is now `applied`, not `approved`
        applied: true,
      }),
    ).toMatch(/Open the created work items/);
  });

  it("still asks for approval when nothing has been applied yet", () => {
    expect(
      nextAction({
        hasPackage: true,
        hasFindings: true,
        conflicts: 0,
        hasPlan: true,
        approvedChanges: 0,
        applied: false,
      }),
    ).toMatch(/approve what to create/);
  });
});
