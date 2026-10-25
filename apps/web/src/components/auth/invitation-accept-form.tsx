"use client";

import { useRouter } from "next/navigation";

import { useAcceptInvitation, useAuthUser } from "@/hooks/auth/use-auth";
import { invitationFailure } from "@/lib/auth/invitation-failure";
import { isSignedIn } from "@/lib/auth/session-status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export function InvitationAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const accept = useAcceptInvitation();
  const { data, isPending: sessionPending, isError: sessionError } = useAuthUser();
  const signedIn = isSignedIn(data, sessionPending, sessionError);
  // Come back here once they have a session, so accepting is one click away.
  const back = encodeURIComponent(`/invitations/${token}`);

  const onAccept = () => {
    accept.mutate(token, {
      onSuccess: (result) => router.push(`/${result.workspace_slug}`),
    });
  };

  if (accept.isError) {
    const failure = invitationFailure(accept.error);
    return (
      <EmptyState
        assetKey="error"
        title={failure.title}
        description={failure.description}
        actions={
          failure.kind === "wrong-account"
            ? [{ label: "Switch account", href: `/sign-in?switch=1&next=${back}` }]
            : [{ label: "Sign in", href: `/sign-in?next=${back}` }]
        }
      />
    );
  }

  return (
    <div className="w-full max-w-sm space-y-4 text-center">
      <h1 className="text-lg font-semibold">You&apos;re invited</h1>

      {/* No workspace name: the token is all this page has, and no endpoint
          resolves one to the other without spending it. Better a sentence that
          is true than a name we would have to invent. */}
      <p className="text-sm text-muted-foreground">
        {signedIn
          ? "Accept to join the workspace you were invited to. Any projects you've been added to will be waiting for you."
          : "Create your account to join. Most people invited here are new to GigsNano — the invitation stays valid while you sign up."}
      </p>

      {/* Accepting needs a session. Offering the button to a signed-out invitee
          only produces a 401, which this page used to report as an expired
          invitation — so they get the account step instead of a dead end. */}
      {signedIn ? (
        <Button
          className="w-full active:scale-[0.97]"
          disabled={accept.isPending}
          onClick={onAccept}
        >
          {accept.isPending ? "Joining…" : "Accept invitation"}
        </Button>
      ) : (
        <div className="space-y-2">
          <Button
            className="w-full active:scale-[0.97]"
            disabled={sessionPending}
            onClick={() => router.push(`/sign-up?next=${back}`)}
          >
            Create account &amp; join
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={sessionPending}
            onClick={() => router.push(`/sign-in?next=${back}`)}
          >
            I already have an account
          </Button>
        </div>
      )}
    </div>
  );
}
