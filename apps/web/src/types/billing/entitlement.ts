/** One capability's plan state for the workspace (`GET .../entitlements/`). */
export interface IEntitlement {
  key: string;
  available: boolean;
  metered: boolean;
  /** Monthly quota when metered; null = unlimited. */
  quota: number | null;
  used: number;
}
