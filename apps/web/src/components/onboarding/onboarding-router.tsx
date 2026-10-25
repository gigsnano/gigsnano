"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { PendingInviteBanner } from "@/components/workspace/pending-invite-banner";
import { VerifyEmailBanner } from "@/components/auth/verify-email-banner";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { useAuthUser, useWorkspaces } from "@/hooks/auth/use-auth";
import { usePendingInvites } from "@/hooks/workspace/use-members";
import { onboardingDestination } from "@/lib/auth/onboarding-destination";

/**
 * Decides what onboarding actually shows (GIN-529).
 *
 * The create-workspace wizard used to render for everyone, which stranded the
 * one person who most needs a way forward: someone invited to a workspace that
 * already exists, with a project already waiting for them. They have no reason
 * to create a workspace and, from that screen, no way to reach the one they
 * were invited to.
 */
export function OnboardingRouter() {
  const router = useRouter();
  const { data: user } = useAuthUser();
  const { data: workspaces } = useWorkspaces();
  const { data: invites } = usePendingInvites();

  const destination = onboardingDestination({
    workspaces,
    invites,
    lastWorkspaceSlug: user?.last_workspace_slug,
  });
  const slug = destination.kind === "workspace" ? destination.slug : null;

  useEffect(() => {
    if (slug) router.replace(`/${slug}`);
  }, [router, slug]);

  // Redirecting, or still deciding. Never flash the wizard at someone who is
  // about to be sent somewhere else.
  if (destination.kind === "loading" || destination.kind === "workspace") {
    return (
      <SkeletonReveal
        isLoading
        className="h-10 w-56"
        skeleton={<div className="size-full rounded-lg bg-muted" />}
      >
        <div />
      </SkeletonReveal>
    );
  }

  if (destination.kind === "invite") {
    return (
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">You&apos;ve been invited</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accept to join the workspace. Any projects you&apos;ve been added to are waiting for
            you inside.
          </p>
        </div>
        {/* Self-hides once the address is verified. Accepting an emailed
            invitation without its token requires that, so the way to unblock
            has to be on the same screen as the refusal. */}
        <VerifyEmailBanner />
        <PendingInviteBanner />
      </div>
    );
  }

  return <OnboardingWizard />;
}
