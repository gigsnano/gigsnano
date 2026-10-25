"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuthUser } from "@/hooks/auth/use-auth";
import { isSignedIn } from "@/lib/auth/session-status";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";

/** Redirects unauthenticated users to /sign-in (session via GET /auth/me/). */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, isPending, isError } = useAuthUser();
  const signedIn = isSignedIn(data, isPending, isError);

  useEffect(() => {
    if (isPending || signedIn) return;
    const next = encodeURIComponent(pathname);
    router.replace(`/sign-in?next=${next}`);
  }, [isPending, pathname, router, signedIn]);

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <SkeletonReveal
          isLoading
          className="h-10 w-56"
          skeleton={<div className="size-full rounded-lg bg-muted" />}
        >
          <div />
        </SkeletonReveal>
      </div>
    );
  }

  if (!signedIn) return null;

  return children;
}
