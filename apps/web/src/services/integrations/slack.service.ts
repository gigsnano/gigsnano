import type { ISlackChannel, ISlackStatus, IUpdateSlackConfigPayload } from "@/types";

import { APIService } from "../api.service";

/** Mirrors workspace.service.ts's GitHub OAuth methods (GIN-23a) — its own
 * domain file per plan (not folded into use-auth.ts's GitHub deviation). */
class SlackService extends APIService {
  getStatus(workspaceSlug: string) {
    return this.get<ISlackStatus>(`/workspaces/${workspaceSlug}/slack/`);
  }

  getInstallUrl(workspaceSlug: string) {
    return this.get<{ url: string }>(`/workspaces/${workspaceSlug}/slack/install-url/`);
  }

  completeOAuth(workspaceSlug: string, code: string, state: string) {
    return this.post<ISlackStatus>(`/workspaces/${workspaceSlug}/slack/oauth/callback/`, {
      code,
      state,
    });
  }

  getChannels(workspaceSlug: string) {
    return this.get<ISlackChannel[]>(`/workspaces/${workspaceSlug}/slack/channels/`);
  }

  updateConfig(workspaceSlug: string, payload: IUpdateSlackConfigPayload) {
    return this.patch<ISlackStatus>(`/workspaces/${workspaceSlug}/slack/`, payload);
  }

  disconnect(workspaceSlug: string) {
    return this.post<{ success: boolean }>(`/workspaces/${workspaceSlug}/slack/disconnect/`, {});
  }
}

export const slackService = new SlackService();
