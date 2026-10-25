/** Read/write the shareable `gigsql` query param on Work Items routes. */
export const ISSUES_GIGSQL_PARAM = "gigsql";

export function readGigsqlParam(params: URLSearchParams): string {
  return params.get(ISSUES_GIGSQL_PARAM)?.trim() ?? "";
}

export function writeGigsqlParam(params: URLSearchParams, gigsql: string): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  const trimmed = gigsql.trim();
  if (trimmed) next.set(ISSUES_GIGSQL_PARAM, trimmed);
  else next.delete(ISSUES_GIGSQL_PARAM);
  return next;
}
