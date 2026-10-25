import type { IOffsetPage } from "@/types";

/** Default page size for admin tables. */
export const DEFAULT_OFFSET_PAGE_LIMIT = 20;

export type TOffsetPageSlice = Pick<IOffsetPage<unknown>, "offset" | "limit" | "total">;

export function offsetPageWindow({ offset, limit, total }: TOffsetPageSlice): string {
  if (total === 0) return "0 of 0";
  return `${offset + 1}-${Math.min(offset + limit, total)} of ${total}`;
}

export function canOffsetPagePrev(offset: number): boolean {
  return offset > 0;
}

export function canOffsetPageNext({ offset, limit, total }: TOffsetPageSlice): boolean {
  return offset + limit < total;
}

export function prevOffsetPage({ offset, limit }: Pick<TOffsetPageSlice, "offset" | "limit">): number {
  return Math.max(0, offset - limit);
}

export function nextOffsetPage({ offset, limit }: Pick<TOffsetPageSlice, "offset" | "limit">): number {
  return offset + limit;
}

/** Slice a full in-memory list into an offset page (mocks + tests). */
export function paginateArray<T>(
  items: T[],
  limit: number = DEFAULT_OFFSET_PAGE_LIMIT,
  offset: number = 0,
): IOffsetPage<T> {
  const safeLimit = Math.max(1, limit);
  const safeOffset = Math.max(0, offset);
  return {
    items: items.slice(safeOffset, safeOffset + safeLimit),
    total: items.length,
    limit: safeLimit,
    offset: safeOffset,
  };
}

export function readOffsetPageParams(query: URLSearchParams): { limit?: number; offset?: number } {
  const num = (value: string | null) => {
    if (value == null || value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  };
  return {
    limit: num(query.get("limit")),
    offset: num(query.get("offset")),
  };
}
