"use client";

import { Suspense, type ReactNode } from "react";

import { GuestGuard } from "@/components/auth/guest-guard";

export function AuthLayoutShell({ children }: { children: ReactNode }) {
  // GuestGuard reads useSearchParams — it needs a Suspense boundary above it or
  // static prerender of the auth pages (/sign-in) fails at build time.
  // The fallback must NOT be `children`: children re-reads useSearchParams, so a
  // self-referential fallback re-suspends and flips the boundary forever,
  // remounting GuestGuard (and its useAuthUser query) in a tight loop.
  return (
    <Suspense fallback={null}>
      <GuestGuard>{children}</GuestGuard>
    </Suspense>
  );
}
