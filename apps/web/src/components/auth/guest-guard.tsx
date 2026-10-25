"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuthUser } from "@/hooks/auth/use-auth";
import { sanitizeAuthRedirect } from "@/lib/auth/sanitize-auth-redirect";
import { isSignedIn } from "@/lib/auth/session-status";

/**
 * Auth routes: bounce signed-in users to their workspace or ?next=.
 *
 * `?switch=1` opts out of that bounce. Without it a signed-in user cannot reach
 * the sign-in page at all, which is a dead end for the person holding an
 * invitation addressed to a different email — the invite 403s telling them to
 * sign in as that account, and every route there bounces them back.
 *
 * `/invitations/<token>` opts out permanently: it is the one page in this group
 * that *requires* a session to do its job. Bouncing a signed-in user off it made
 * the accept button unreachable — someone who signed up from an invite link was
 * pushed back to the invite page, bounced straight to /onboarding, and asked to
 * create the workspace they had just been invited to.
 */
export function GuestGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { data, isPending, isError } = useAuthUser();
  const switching = searchParams.get("switch") === "1";
  const signedIn = isSignedIn(data, isPending, isError);
  const bounce = signedIn && !switching && !pathname?.startsWith("/invitations/");

  useEffect(() => {
    if (!bounce) return;
    router.replace(
      sanitizeAuthRedirect(
        searchParams.get("next"),
        data.last_workspace_slug ? `/${data.last_workspace_slug}` : "/onboarding",
      ),
    );
  }, [bounce, data, router, searchParams]);

  if (isPending || bounce) return null;

  return children;
}
