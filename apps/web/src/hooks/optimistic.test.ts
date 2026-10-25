import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import { optimisticPatchById, restoreSnapshots } from "./optimistic";

describe("optimisticPatchById", () => {
  it("patches an entity across array, page, and single-object caches, and rolls back", () => {
    const qc = new QueryClient();
    const root = ["workspaces", "acme"];
    qc.setQueryData([...root, "stories"], [{ id: "s1", status: "todo" }, { id: "s2", status: "todo" }]);
    qc.setQueryData([...root, "my-stories"], { items: [{ id: "s1", status: "todo" }], total: 1 });
    qc.setQueryData([...root, "story", "s1"], { id: "s1", status: "todo" });
    qc.setQueryData(["other"], [{ id: "s1", status: "todo" }]); // outside root — untouched

    const snapshots = optimisticPatchById(qc, root, "s1", { status: "done" });

    expect(qc.getQueryData([...root, "stories"])).toEqual([
      { id: "s1", status: "done" },
      { id: "s2", status: "todo" }, // sibling untouched
    ]);
    expect(qc.getQueryData([...root, "my-stories"])).toEqual({
      items: [{ id: "s1", status: "done" }],
      total: 1,
    });
    expect(qc.getQueryData([...root, "story", "s1"])).toEqual({ id: "s1", status: "done" });
    expect(qc.getQueryData(["other"])).toEqual([{ id: "s1", status: "todo" }]); // never matched
    expect(snapshots).toHaveLength(3);

    restoreSnapshots(qc, snapshots);
    expect(qc.getQueryData([...root, "stories"])).toEqual([
      { id: "s1", status: "todo" },
      { id: "s2", status: "todo" },
    ]);
    expect(qc.getQueryData([...root, "story", "s1"])).toEqual({ id: "s1", status: "todo" });
  });
});
