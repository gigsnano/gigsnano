import type { IEntitlement } from "@/types";

import { APIService } from "../api.service";

class EntitlementService extends APIService {
  getEntitlements(workspaceSlug: string) {
    return this.get<IEntitlement[]>(`/workspaces/${workspaceSlug}/entitlements/`);
  }
}

export const entitlementService = new EntitlementService();
