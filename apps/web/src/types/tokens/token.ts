import type { ID, ISODateString } from "@/types/common";

/** Personal access token (developer/API auth). User-scoped — no workspaceSlug. */
export interface IPersonalAccessToken {
  id: ID;
  name: string;
  last_used_at: ISODateString | null;
  created_at: ISODateString;
  revoked_at: ISODateString | null;
}

/** Returned ONLY by create -- carries the plaintext token, shown once. */
export type ICreatedToken = Pick<IPersonalAccessToken, "id" | "name" | "created_at"> & {
  token: string;
};

export interface ICreateTokenPayload {
  name: string;
}
