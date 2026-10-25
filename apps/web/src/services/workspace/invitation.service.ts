import type {
  IInviteBatchPayload,
  IRecipientResult,
  IWorkspaceInvitation,
} from "@/types";

import { APIService } from "../api.service";

class InvitationService extends APIService {
  getInvitations(workspaceSlug: string) {
    return this.get<IWorkspaceInvitation[]>(`/workspaces/${workspaceSlug}/invitations/`);
  }

  /** Batch invite. Resolves with one result per recipient even when some fail —
   *  a partial failure is reported in the body, not as a rejected request. */
  inviteMembers(workspaceSlug: string, payload: IInviteBatchPayload) {
    return this.post<{ results: IRecipientResult[] }>(
      `/workspaces/${workspaceSlug}/invitations/`,
      payload,
    );
  }

  /** Re-issues the invitation. Rotates the token, so any link shared earlier
   *  stops working — that is the intent, not a side effect. */
  resendInvitation(workspaceSlug: string, invitationId: string) {
    return this.post<IRecipientResult>(
      `/workspaces/${workspaceSlug}/invitations/${invitationId}/resend/`,
      {},
    );
  }

  revokeInvitation(workspaceSlug: string, invitationId: string) {
    return this.delete<void>(`/workspaces/${workspaceSlug}/invitations/${invitationId}/`);
  }
}

export const invitationService = new InvitationService();
