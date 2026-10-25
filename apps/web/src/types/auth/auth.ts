export type { IAuthUser } from "@gigsnano/core";

export interface IUpdateAccountPayload {
  display_name?: string;
  email_digest?: boolean;
  product_updates?: boolean;
}

export interface IChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface IResetPasswordPayload {
  token: string;
  new_password: string;
}

export interface IVerifyEmailPayload {
  token: string;
}

export interface ISignInPayload {
  email: string;
  password: string;
}

export interface ISignUpPayload {
  display_name: string;
  email: string;
  password: string;
}

export interface IGoogleAuthPayload {
  id_token: string;
}

export interface ICreateWorkspacePayload {
  name: string;
  slug: string;
}

export interface IMobileHandoffPayload {
  code_challenge: string;
  code_challenge_method: "S256";
  redirect_uri: string;
}

export interface IMobileHandoffResult {
  code: string;
  expires_in: number;
}
