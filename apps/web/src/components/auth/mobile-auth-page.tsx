"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useAuthUser, useMobileHandoff, useSignOut } from "@/hooks/auth/use-auth";
import { authErrorMessage } from "@/lib/auth/auth-error";
import { expoDevHost, handoffRedirectUrl, isHandoffRejection } from "@/lib/auth/mobile-handoff-redirect";
import { isSignedIn } from "@/lib/auth/session-status";

const OPEN_FROM_APP = "Open this page from the GigsNano app.";

/** Consent step of the mobile browser hand-off: a code is minted only on an explicit click. */
export function MobileAuthPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isPending, isError } = useAuthUser();
  const handoff = useMobileHandoff();
  const signOut = useSignOut();
  const [error, setError] = useState<string | null>(null);

  const challenge = searchParams.get("challenge");
  const state = searchParams.get("state");
  const redirectUri = searchParams.get("redirect_uri");
  const valid = !!challenge && !!state && !!redirectUri;
  const devHost = redirectUri ? expoDevHost(redirectUri) : null;
  const signedIn = isSignedIn(data, isPending, isError);
  const query = searchParams.toString();
  const here = encodeURIComponent(query ? `${pathname}?${query}` : pathname);

  useEffect(() => {
    if (!valid || isPending || signedIn) return;
    router.replace(`/sign-in?next=${here}`);
  }, [valid, isPending, signedIn, router, here]);

  if (!valid || isHandoffRejection(handoff.error)) {
    return <p className="text-center text-sm text-muted-foreground">{OPEN_FROM_APP}</p>;
  }
  if (isPending || !signedIn) return <p className="text-center text-sm text-muted-foreground">Loading…</p>;

  function proceed() {
    if (!challenge || !state || !redirectUri) return;
    setError(null);
    handoff.mutate(
      { code_challenge: challenge, code_challenge_method: "S256", redirect_uri: redirectUri },
      {
        onSuccess: ({ code }) => {
          window.location.href = handoffRedirectUrl(redirectUri, code, state);
        },
        onError: (e) => {
          if (!isHandoffRejection(e)) setError(authErrorMessage(e));
        },
      },
    );
  }

  function switchAccount() {
    signOut.mutate(undefined, { onSuccess: () => router.replace(`/sign-in?switch=1&next=${here}`) });
  }

  return (
    <div className="flex flex-col gap-4 text-center">
      <div>
        <h1 className="text-lg font-semibold">Sign in to the app</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as <span className="break-all font-medium text-foreground">{data?.email}</span>
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {devHost ? (
        <div role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-left text-sm">
          <p className="font-medium text-warning">Developer build</p>
          <p className="mt-1 text-muted-foreground">
            This sends your sign-in to an Expo development server at{" "}
            <span className="break-all font-medium text-foreground">{devHost}</span>. Continue only if you started it
            yourself.
          </p>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Only continue if you just tapped Continue with Google in the GigsNano app on this device.
      </p>
      <Button onClick={proceed} disabled={handoff.isPending || handoff.isSuccess}>
        Continue to the GigsNano app
      </Button>
      <Button variant="outline" onClick={switchAccount} disabled={signOut.isPending}>
        Use a different account
      </Button>
    </div>
  );
}
