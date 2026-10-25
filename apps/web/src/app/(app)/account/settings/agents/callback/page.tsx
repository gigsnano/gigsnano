"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useCompleteAgentOAuth } from "@/hooks/ai/use-agent-connections";
import { authErrorMessage } from "@/lib/auth/auth-error";

/**
 * OAuth redirect target for Cursor / Codex / Claude Code connect flows.
 * Reads ?code=&state= from the provider and completes the token exchange.
 */
function AgentOAuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const complete = useCompleteAgentOAuth();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const ran = useRef(false);

  const oauthError = params.get("error");
  const code = params.get("code");
  const state = params.get("state");

  const validationError = oauthError
    ? params.get("error_description") || "Agent authorization was cancelled."
    : !code || !state
      ? "Missing authorization details. Please start the connection again."
      : null;

  const error = validationError ?? mutationError;

  useEffect(() => {
    if (ran.current || validationError || !code || !state) return;
    ran.current = true;

    complete.mutate(
      { code, state },
      {
        onSuccess: () => {
          router.replace("/account/settings/agents?connected=1");
        },
        onError: (err) => setMutationError(authErrorMessage(err)),
      },
    );
  }, [validationError, code, state, complete, router]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      {error ? (
        <>
          <p className="text-sm font-medium text-destructive">Couldn&apos;t connect agent</p>
          <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => router.replace("/account/settings/agents")}
            className="mt-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out hover:bg-muted active:scale-[0.97]"
          >
            Back to coding agents
          </button>
        </>
      ) : (
        <>
          <div className="t-delegation-spin size-6 rounded-full border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Connecting your coding agent…</p>
        </>
      )}
    </div>
  );
}

export default function AgentOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
          Connecting your coding agent…
        </div>
      }
    >
      <AgentOAuthCallback />
    </Suspense>
  );
}
