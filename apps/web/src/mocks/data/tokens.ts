import type { ICreatedToken, IPersonalAccessToken } from "@/types";

/** User-scoped personal access tokens (developer/API auth). Kept simple as a
 * single flat array — mirrors the other mock domains that don't multiplex by
 * the (single) mock signed-in user. */
export const mockTokens: IPersonalAccessToken[] = [];

export function makeCreatedToken(name: string): ICreatedToken {
  const id = `pat_${mockTokens.length + 1}`;
  const created_at = new Date().toISOString();
  const stored: IPersonalAccessToken = {
    id,
    name,
    last_used_at: null,
    created_at,
    revoked_at: null,
  };
  mockTokens.unshift(stored);
  return { id, name, created_at, token: `gnp_mock${id}` };
}
