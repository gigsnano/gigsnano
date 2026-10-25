import type {
  IAuthUser,
  IChangePasswordPayload,
  IGoogleAuthPayload,
  IMobileHandoffPayload,
  IMobileHandoffResult,
  IResetPasswordPayload,
  ICreateWorkspacePayload,
  ISignInPayload,
  ISignUpPayload,
  IUpdateAccountPayload,
  IWorkspace,
} from "@/types";

import { APIService } from "../api.service";

class AuthService extends APIService {
  getMe() {
    return this.get<IAuthUser>(`/auth/me/`);
  }

  signIn(payload: ISignInPayload) {
    return this.post<IAuthUser>(`/auth/sign-in/`, payload);
  }

  signUp(payload: ISignUpPayload) {
    return this.post<IAuthUser>(`/auth/sign-up/`, payload);
  }

  signInWithGoogle(payload: IGoogleAuthPayload) {
    return this.post<IAuthUser>(`/auth/google/`, payload);
  }

  createMobileHandoff(payload: IMobileHandoffPayload) {
    return this.post<IMobileHandoffResult>(`/auth/mobile/handoff/`, payload);
  }

  signOut() {
    return this.post<{ success: boolean }>(`/auth/sign-out/`, {});
  }

  forgotPassword(email: string) {
    return this.post<{ success: boolean }>(`/auth/forgot-password/`, { email });
  }

  updateAccount(payload: IUpdateAccountPayload) {
    return this.patch<IAuthUser>(`/auth/me/`, payload);
  }

  changePassword(payload: IChangePasswordPayload) {
    return this.post<{ success: boolean }>(`/auth/change-password/`, payload);
  }

  resetPassword(payload: IResetPasswordPayload) {
    return this.post<{ success: boolean }>(`/auth/reset-password/`, payload);
  }

  requestVerifyEmail() {
    return this.post<{ ok: boolean }>(`/auth/verify-email/request/`, {});
  }

  confirmVerifyEmail(token: string) {
    return this.post<{ ok: boolean }>(`/auth/verify-email/confirm/`, { token });
  }

  acceptInvitation(token: string) {
    return this.post<{ workspace_slug: string }>(`/auth/invitations/${token}/accept/`, {});
  }

  createWorkspace(payload: ICreateWorkspacePayload) {
    return this.post<IWorkspace>(`/workspaces/`, payload);
  }
}

export const authService = new AuthService();
