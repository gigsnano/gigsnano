"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useAuthUser, useSignIn } from "@/hooks/auth/use-auth";
import { authErrorMessage } from "@/lib/auth/auth-error";
import { resolveAuthRedirect } from "@/lib/auth/post-auth-redirect";
import { Button } from "@/components/ui/button";
import { AuthDivider } from "@/components/auth/auth-divider";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { isGoogleSignInEnabled } from "@/lib/auth/google-config";
import Link from "next/link";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signIn = useSignIn();
  // Present only when arriving from "Switch account" — GuestGuard lets a
  // signed-in user through in that case, so there is a session to name.
  const { data: current } = useAuthUser();
  const switching = searchParams.get("switch") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await signIn.mutateAsync({ email, password });
      const { url, hardNavigate } = resolveAuthRedirect(
        searchParams.get("next"),
        user.last_workspace_slug ? `/${user.last_workspace_slug}` : "/onboarding",
        window.location.origin,
      );
      if (hardNavigate) window.location.assign(url);
      else router.push(url);
    } catch {
      // Error surfaced via signIn.error below; swallow to avoid an unhandled rejection.
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{switching ? "Switch account" : "Welcome back"}</h1>
        <p className="text-sm text-muted-foreground">
          {switching
            ? "Sign in as someone else. Your current session stays active until you do."
            : "Sign in to continue to your workspace."}
        </p>
      </div>

      {switching && current ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="min-w-0 text-xs text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">{current.display_name}</span>
            <span className="block truncate">{current.email}</span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => router.back()}
          >
            Stay
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
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
          <span className="flex items-center justify-between">
            Password
            <Link href="/forgot-password" className="text-xs font-normal text-primary hover:underline">
              Forgot?
            </Link>
          </span>
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

      {signIn.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {authErrorMessage(signIn.error)}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={signIn.isPending}>
        {signIn.isPending ? "Signing in…" : "Sign in"}
      </Button>

      {isGoogleSignInEnabled ? (
        <>
          <AuthDivider />
          <GoogleSignInButton />
        </>
      ) : null}

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link
          // Carry `next` across so an invitee who lands here and then realises
          // they need an account still returns to their invitation.
          href={
            searchParams.get("next")
              ? `/sign-up?next=${encodeURIComponent(searchParams.get("next") ?? "")}`
              : "/sign-up"
          }
          className="font-medium text-primary hover:underline"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
