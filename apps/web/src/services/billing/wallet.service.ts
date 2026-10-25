import { APIService } from "@/services/api.service";
import type { IWallet, IWalletTransaction, IConnectAccount, ITopupResponse } from "@/types";

class WalletService extends APIService {
  getWallet(slug: string) {
    return this.get<IWallet>(`/workspaces/${slug}/billing/wallet/`);
  }
  createTopup(slug: string, amount_cents: number) {
    return this.post<ITopupResponse>(`/workspaces/${slug}/billing/topup/`, { amount_cents });
  }
  listTransactions(slug: string) {
    return this.get<IWalletTransaction[]>(`/workspaces/${slug}/billing/transactions/`);
  }
  getConnectStatus() {
    return this.get<IConnectAccount>(`/billing/connect/status/`);
  }
  createConnectOnboarding() {
    return this.post<{ url: string }>(`/billing/connect/onboard/`, {});
  }
}
export const walletService = new WalletService();
