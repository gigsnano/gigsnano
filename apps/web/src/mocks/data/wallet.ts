import type { IWallet, IWalletTransaction } from "@/types";

export const walletBySlug: Record<string, IWallet> = {
  acme: { available_cents: 5000, held_cents: 0, currency: "usd" },
};
export const walletTxnsBySlug: Record<string, IWalletTransaction[]> = {
  acme: [{
    id: "wt_1", type: "topup", amount_cents: 5000, available_after: 5000,
    held_after: 0, ref_type: "topup", created_at: "2026-07-01T00:00:00Z",
  }],
};
