import { describe, expect, it } from "vitest";

import { EDocumentSource } from "@/types/docs/document";

describe("EDocumentSource", () => {
  it("has user and agent members", () => {
    expect(EDocumentSource.User).toBe("user");
    expect(EDocumentSource.Agent).toBe("agent");
  });
});
