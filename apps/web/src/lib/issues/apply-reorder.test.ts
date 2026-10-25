import { describe, it, expect } from "vitest";
import { applyReorder } from "./apply-reorder";
import { EStoryStatus, type IStory } from "@/types";

const base = (id: string, order: number): IStory => ({ id, order, status: EStoryStatus.Todo } as IStory);

describe("applyReorder", () => {
  it("patches order (and other fields) on the target story only", () => {
    const stories = [base("a", 100), base("b", 200)];
    const next = applyReorder(stories, "b", { order: 50, status: EStoryStatus.Done });
    const b = next.find((s) => s.id === "b")!;
    expect(b.order).toBe(50);
    expect(b.status).toBe(EStoryStatus.Done);
    expect(next.find((s) => s.id === "a")!.order).toBe(100);
    expect(next).not.toBe(stories);
  });
});
