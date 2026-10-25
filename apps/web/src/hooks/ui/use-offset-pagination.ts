"use client";

import { useState } from "react";

import { DEFAULT_OFFSET_PAGE_LIMIT } from "@/lib/pagination/offset-page";

/** Page-level offset state for offset-paginated API lists. */
export function useOffsetPagination(defaultLimit = DEFAULT_OFFSET_PAGE_LIMIT) {
  const [offset, setOffset] = useState(0);
  const [limit] = useState(defaultLimit);

  const reset = () => setOffset(0);

  const pageFilters = { limit, offset };

  return {
    offset,
    limit,
    setOffset,
    reset,
    pageFilters,
  };
}
