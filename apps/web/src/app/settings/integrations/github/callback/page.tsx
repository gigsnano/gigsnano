"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useCompleteGitHubOAuth } from "@/hooks/auth/use-auth";
import { authErrorMessage } from "@/lib/auth/auth-error";

/**
 * GitHub OAuth redirect lands here (the App's registered callback URL) with
 * ?code=&state=. The workspace slug isn't in the URL, so we read it from the
 * sessionStorage crumb the RepoPicker left before redirecting, complete the
 * token exchange on the backend, then bounce back into the workspace.
 */
function GitHubCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const complete = useCompleteGitHubOAuth();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const ran = useRef(false);

  const oauthError = params.get("error");
  const code = params.get("code");
  const state = params.get("state");
  const slug = typeof window !== "undefined" ? sessionStorage.getItem("gh_oauth_ws") : null;

  const validationError = oauthError
    ? params.get("error_description") || "GitHub authorization was cancelled."
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
          // Return to wherever the connect flow started (e.g. the create-project
          // dialog, via ?resumeCreate), falling back to the projects list.
          const returnTo = sessionStorage.getItem("gh_oauth_return");
          sessionStorage.removeItem("gh_oauth_ws");
          sessionStorage.removeItem("gh_oauth_return");
          router.replace(returnTo || `/${slug}/projects`);
        },
        onError: (err) => setMutationError(authErrorMessage(err)),
      },
    );
  }, [validationError, code, state, slug, complete, router]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      {error ? (
        <>
          <p className="text-sm font-medium text-destructive">Couldn&apos;t connect GitHub</p>
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
          <p className="text-sm text-muted-foreground">Connecting your GitHub account…</p>
        </>
      )}
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
          Connecting your GitHub account…
        </div>
      }
    >
      <GitHubCallback />
    </Suspense>
  );
}
