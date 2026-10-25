"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";

import { useGoogleSignIn } from "@/hooks/auth/use-auth";
import {
  ensureGoogleIdentityInitialized,
  renderGoogleSignInButton,
  setGoogleCredentialCallback,
} from "@/lib/auth/load-gsi";
import { GOOGLE_CLIENT_ID } from "@/lib/auth/google-config";
import { authErrorMessage } from "@/lib/auth/auth-error";
import { resolveAuthRedirect } from "@/lib/auth/post-auth-redirect";
import type { IAuthUser } from "@/types";

export function GoogleSignInButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const googleSignIn = useGoogleSignIn();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every failed attempt so the error message remounts (and its
  // shake-in replays) even when the same error string repeats back to back.
  const [errorKey, setErrorKey] = useState(0);

  // Latest callback held in a ref so GSI init stays once-only.
  const onCredentialRef = useRef<(credential: string) => void>(() => {});

  useEffect(() => {
    onCredentialRef.current = async (credential: string) => {
      setError(null);
      try {
        const user: IAuthUser = await googleSignIn.mutateAsync({ id_token: credential });
        const { url, hardNavigate } = resolveAuthRedirect(
          searchParams.get("next"),
          user.last_workspace_slug ? `/${user.last_workspace_slug}` : "/onboarding",
          window.location.origin,
        );
        if (hardNavigate) window.location.assign(url);
        else router.push(url);
      } catch (e) {
        setError(authErrorMessage(e));
        setErrorKey((k) => k + 1);
      }
    };
    setGoogleCredentialCallback((credential) => onCredentialRef.current(credential));
  }, [googleSignIn, router, searchParams]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;

    ensureGoogleIdentityInitialized(GOOGLE_CLIENT_ID).then(() => {
      const el = containerRef.current;
      if (cancelled || !el) return;

      let lastWidth = -1;
      const render = () => {
        const width = Math.round(el.offsetWidth) || 320;
        if (width === lastWidth) return; // width unchanged: skip re-render (avoids a
        lastWidth = width; // ResizeObserver -> re-render -> resize thrash loop)
        renderGoogleSignInButton(el, {
          type: "standard",
          theme: resolvedTheme === "dark" ? "filled_black" : "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular", // closer to the app's rounded-xl than GSI's full "pill"
          width,
        });
      };

      render();
      // GSI needs a pixel width; keep it synced as the container resizes (sidebar
      // collapse, viewport changes) instead of a one-time measurement at mount.
      observer = new ResizeObserver(render);
      observer.observe(el);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [resolvedTheme]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="t-stagger-line flex flex-col gap-2">
      <div ref={containerRef} className="flex min-h-10 w-full justify-center" />
      {error ? (
        <p key={errorKey} role="alert" className="t-error is-shaking text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
