"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useCompleteSlackOAuth } from "@/hooks/slack/use-slack";
import { authErrorMessage } from "@/lib/auth/auth-error";

/**
 * Slack OAuth redirect lands here with ?code=&state=. The workspace slug isn't
 * in the URL, so we read it from the sessionStorage crumb the integrations
 * settings page left before redirecting (mirrors the GitHub callback page).
 */
function SlackCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const complete = useCompleteSlackOAuth();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const ran = useRef(false);

  const oauthError = params.get("error");
  const code = params.get("code");
  const state = params.get("state");
  const slug = typeof window !== "undefined" ? sessionStorage.getItem("slack_oauth_ws") : null;

  const validationError = oauthError
    ? params.get("error_description") || "Slack authorization was cancelled."
    : typeof window !== "undefined" && (!code || !state || !slug)
      ? "Missing authorization details. Please start the connection again."
      : null;

  const error = validationError ?? mutationError;

  useEffect(() => {
    if (ran.current || validationError || !code || !state || !slug) return;
    ran.current = true;

    complete.mutate(
      { slug, code, state },
      {
        onSuccess: () => {
          const returnTo = sessionStorage.getItem("slack_oauth_return");
          sessionStorage.removeItem("slack_oauth_ws");
          sessionStorage.removeItem("slack_oauth_return");
          router.replace(returnTo || `/${slug}/settings/integrations`);
        },
        onError: (err) => setMutationError(authErrorMessage(err)),
      },
    );
  }, [validationError, code, state, slug, complete, router]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      {error ? (
        <>
          <p className="text-sm font-medium text-destructive">Couldn&apos;t connect Slack</p>
          <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="mt-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Back to app
          </button>
        </>
      ) : (
        <>
          <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Connecting your Slack workspace…</p>
        </>
      )}
    </div>
  );
}

export default function SlackCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
          Connecting your Slack workspace…
        </div>
      }
    >
      <SlackCallback />
    </Suspense>
  );
}
