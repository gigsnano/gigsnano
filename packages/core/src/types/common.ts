/**
 * Shared shapes for the GigsNano backend (a separate Python/HTTP service).
 * Field naming is snake_case to match a typical Python/DRF JSON contract — keep
 * these in sync with the backend's OpenAPI spec when it lands.
 */

export type ID = string;
export type ISODateString = string;

/** Offset/limit page envelope — matches gigsnano-api `OffsetPageOut`. */
export interface IOffsetPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface IOffsetPageFilters {
  limit?: number;
  offset?: number;
}

/**
 * DRF-style paginated envelope. Reserved for endpoints that expose cursor URLs;
 * prefer `IOffsetPage<T>` for admin tables.
 */
export interface IPaginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
