import { describe, expect, it } from "vitest";

import {
  addRecipients,
  isDisposableEmail,
  problemFor,
  removeRecipient,
  sendableRecipients,
  splitRecipients,
  type IRecipient,
} from "./recipient-parse";

const ok = (value: string): IRecipient => ({ value, display: value, problem: null });

describe("splitRecipients", () => {
  it("splits on commas, semicolons, newlines and tabs", () => {
    expect(splitRecipients("a@x.io, b@x.io; c@x.io\nd@x.io\te@x.io")).toEqual([
      "a@x.io", "b@x.io", "c@x.io", "d@x.io", "e@x.io",
    ]);
  });

  it("unwraps the angle-bracket form a mail client pastes", () => {
    expect(splitRecipients("Ada Lovelace <ada@x.io>, bob@x.io")).toEqual(["ada@x.io", "bob@x.io"]);
  });

  it("drops empty fragments from trailing separators", () => {
    expect(splitRecipients("a@x.io,,  ;\n")).toEqual(["a@x.io"]);
  });
});

describe("addRecipients", () => {
  it("normalizes for comparison but keeps what the user typed", () => {
    const { recipients } = addRecipients([], "  Ada@Example.COM ");
    expect(recipients).toEqual([
      { value: "ada@example.com", display: "Ada@Example.COM", problem: null },
    ]);
  });

  it("reports duplicates instead of silently dropping them", () => {
    const { recipients, duplicates } = addRecipients([ok("a@x.io")], "A@X.io, b@x.io");
    expect(recipients.map((r) => r.value)).toEqual(["a@x.io", "b@x.io"]);
    expect(duplicates).toEqual(["A@X.io"]);
  });

  it("deduplicates within a single paste", () => {
    const { recipients } = addRecipients([], "a@x.io, a@x.io");
    expect(recipients).toHaveLength(1);
  });

  it("keeps malformed entries so the chip can explain the problem", () => {
    const { recipients } = addRecipients([], "not-an-email");
    expect(recipients[0].problem).toBe("invalid");
  });
});

describe("disposable addresses", () => {
  it.each([
    "throwaway@mailinator.com",
    "x@YOPMAIL.com",
    "  spam@guerrillamail.com  ",
    "a@temp-mail.org",
  ])("blocks %s", (email) => {
    expect(isDisposableEmail(email)).toBe(true);
    expect(problemFor(email)).toBe("disposable");
  });

  it("blocks subdomains, which these providers hand out freely", () => {
    expect(isDisposableEmail("someone@inbox.mailinator.com")).toBe(true);
  });

  it("does not block a real address that merely looks similar", () => {
    // Substring matching would wrongly catch this — the check is on domain
    // boundaries, not `includes`.
    expect(isDisposableEmail("ada@notmailinator.com")).toBe(false);
    expect(isDisposableEmail("ada@mailinator.com.mycompany.io")).toBe(false);
    expect(problemFor("ada@company.io")).toBeNull();
  });

  it("reports invalid before disposable when an address is both", () => {
    expect(problemFor("not an email @mailinator.com")).toBe("invalid");
  });
});

describe("selection", () => {
  it("removes by normalized value", () => {
    expect(removeRecipient([ok("a@x.io"), ok("b@x.io")], "a@x.io")).toEqual([ok("b@x.io")]);
  });

  it("only offers sendable recipients for submission", () => {
    const { recipients } = addRecipients([], "good@x.io, bad, throwaway@mailinator.com");
    expect(sendableRecipients(recipients).map((r) => r.value)).toEqual(["good@x.io"]);
  });
});
