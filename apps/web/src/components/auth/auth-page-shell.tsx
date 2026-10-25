import type { ReactNode } from "react";

/**
 * Thin wrapper for auth pages. GuestGuard + Suspense live in AuthLayoutShell —
 * do not nest another GuestGuard here (double observers + Suspense remounts
 * caused a /auth/me fetch storm and a sign-in ↔ app redirect loop).
 */
export function AuthPageShell({ children }: { children: ReactNode }) {
  return children;
}
