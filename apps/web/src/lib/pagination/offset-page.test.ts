import { describe, expect, it } from "vitest";

import {
  canOffsetPageNext,
  canOffsetPagePrev,
  nextOffsetPage,
  offsetPageWindow,
  paginateArray,
  prevOffsetPage,
} from "./offset-page";

describe("offset-page", () => {
  it("formats window labels", () => {
    expect(offsetPageWindow({ offset: 0, limit: 20, total: 0 })).toBe("0 of 0");
    expect(offsetPageWindow({ offset: 0, limit: 20, total: 45 })).toBe("1-20 of 45");
    expect(offsetPageWindow({ offset: 40, limit: 20, total: 45 })).toBe("41-45 of 45");
  });

  it("navigates pages", () => {
    const slice = { offset: 20, limit: 10, total: 35 };
    expect(canOffsetPagePrev(slice.offset)).toBe(true);
    expect(canOffsetPageNext(slice)).toBe(true);
    expect(prevOffsetPage(slice)).toBe(10);
    expect(nextOffsetPage(slice)).toBe(30);
    expect(canOffsetPageNext({ offset: 30, limit: 10, total: 35 })).toBe(false);
  });

  it("paginates arrays", () => {
    const page = paginateArray([1, 2, 3, 4, 5], 2, 1);
    expect(page).toEqual({ items: [2, 3], total: 5, limit: 2, offset: 1 });
  });
});
