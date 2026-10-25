import type { IDigestPreference, IDigestPreferenceUpdate } from "@/types";

import { APIService } from "../api.service";

class DigestService extends APIService {
  getPreferences(workspaceSlug: string) {
    return this.get<IDigestPreference>(`/workspaces/${workspaceSlug}/digests/preferences/`);
  }

  updatePreferences(workspaceSlug: string, payload: IDigestPreferenceUpdate) {
    return this.put<IDigestPreference>(
      `/workspaces/${workspaceSlug}/digests/preferences/`,
      payload,
    );
  }
}

export const digestService = new DigestService();
