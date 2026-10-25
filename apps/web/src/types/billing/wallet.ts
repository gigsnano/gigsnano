export interface IWallet {
  available_cents: number;
  held_cents: number;
  currency: string;
}

export interface IWalletTransaction {
  id: string;
  type: string;
  amount_cents: number;
  available_after: number;
  held_after: number;
  ref_type: string | null;
  created_at: string;
}

export enum EConnectStatus {
  Pending = "pending",
  Active = "active",
  Restricted = "restricted",
}

export interface IConnectAccount {
  status: EConnectStatus;
  payouts_enabled: boolean;
}

export interface ITopupResponse {
  checkout_url: string;
  provider_ref: string;
}
