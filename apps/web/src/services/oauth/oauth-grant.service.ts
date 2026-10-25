import type { IOAuthGrant } from "@/types";

import { APIService } from "../api.service";

class OAuthGrantService extends APIService {
  getGrants() {
    return this.get<IOAuthGrant[]>(`/oauth/grants/`);
  }
  revokeGrant(clientId: string) {
    return this.delete<void>(`/oauth/grants/${clientId}/`);
  }
}

export const oauthGrantService = new OAuthGrantService();
