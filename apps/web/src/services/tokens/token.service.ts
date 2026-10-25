import type { ICreatedToken, ICreateTokenPayload, IPersonalAccessToken } from "@/types";

import { APIService } from "../api.service";

class TokenService extends APIService {
  getTokens() {
    return this.get<IPersonalAccessToken[]>(`/auth/tokens/`);
  }
  createToken(payload: ICreateTokenPayload) {
    return this.post<ICreatedToken>(`/auth/tokens/`, payload);
  }
  revokeToken(id: string) {
    return this.delete<void>(`/auth/tokens/${id}/`);
  }
}

export const tokenService = new TokenService();
