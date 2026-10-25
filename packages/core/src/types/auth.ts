import type { ID } from "./common";

export interface IAuthUser {
  id: ID;
  display_name: string;
  email: string;
  avatar_url: string | null;
  /** Last workspace slug the user visited. */
  last_workspace_slug: string | null;
  email_digest: boolean;
  product_updates: boolean;
  email_verified: boolean;
}

/** The slice of a workspace the mobile app needs. */
export interface IWorkspaceRef {
  id: ID;
  slug: string;
  name: string;
}

export interface IMobileTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface IMobileLoginResponse extends IMobileTokens {
  user: IAuthUser;
}
