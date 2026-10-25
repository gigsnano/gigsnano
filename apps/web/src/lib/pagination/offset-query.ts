/** Append offset-page query params to a URLSearchParams instance. */
export function appendOffsetPageParams(
  qs: URLSearchParams,
  filters: { limit?: number; offset?: number },
): void {
  if (filters.limit !== undefined) qs.set("limit", String(filters.limit));
  if (filters.offset !== undefined) qs.set("offset", String(filters.offset));
}
