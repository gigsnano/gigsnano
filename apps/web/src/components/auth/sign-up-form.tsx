"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

import { useSignUp } from "@/hooks/auth/use-auth";
import { authErrorMessage } from "@/lib/auth/auth-error";
import { resolveAuthRedirect } from "@/lib/auth/post-auth-redirect";
import { Button } from "@/components/ui/button";
import { AuthDivider } from "@/components/auth/auth-divider";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { isGoogleSignInEnabled } from "@/lib/auth/google-config";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signUp = useSignUp();
  // Carried into the "Sign in" link too: someone who arrived from an invite and
  // then realises they already have an account must not lose the invite by
  // crossing between these two pages.
  const next = searchParams.get("next");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signUp.mutateAsync({ display_name: displayName, email, password });
      // Honour ?next= like sign-in and the Google button already do. Someone who
      // arrived from an invite link has to be able to get back to it; hard-coding
      // /create-workspace sent them to build a workspace they'd been invited to.
      // The fallback is /onboarding, which routes to an existing workspace or a
      // waiting invite before it ever offers to create one.
      const { url, hardNavigate } = resolveAuthRedirect(next, "/onboarding", window.location.origin);
      if (hardNavigate) window.location.assign(url);
      else router.push(url);
    } catch {
      // Error surfaced via signUp.error below; swallow to avoid an unhandled rejection.
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Create your account</h1>
        <p className="text-sm text-muted-foreground">Get started with BMAD-driven project planning.</p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Full name
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ada Lovelace"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={field}
          />
        </label>
      </div>

      {signUp.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {authErrorMessage(signUp.error)}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={signUp.isPending}>
        {signUp.isPending ? "Creating account…" : "Create account"}
      </Button>

      {isGoogleSignInEnabled ? (
        <>
          <AuthDivider />
          <GoogleSignInButton />
        </>
      ) : null}

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
