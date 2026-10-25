"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { useConfirmVerifyEmail } from "@/hooks/auth/use-auth";
import { Button } from "@/components/ui/button";

export default function VerifyEmailPageClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const confirm = useConfirmVerifyEmail();
  const [done, setDone] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // The missing-token message is derived during render — no state needed.
  const error = token === null ? "Missing verification token." : mutationError;

  useEffect(() => {
    if (token === null) return;
    confirm
      .mutateAsync(token)
      .then(() => setDone(true))
      .catch((err) =>
        setMutationError(err instanceof Error ? err.message : "Verification failed"),
      );
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps, react-doctor/exhaustive-deps

  return (
    <AuthPageShell>
      <div className="flex w-full max-w-sm flex-col gap-4 text-center">
        {done ? (
          <>
            <h1 className="text-lg font-semibold">Email verified</h1>
            <p className="text-sm text-muted-foreground">Your email address is confirmed.</p>
            <Button asChild className="w-full active:scale-[0.97]">
              <Link href="/sign-in">Continue</Link>
            </Button>
          </>
        ) : error ? (
          <>
            <h1 className="text-lg font-semibold">Verification failed</h1>
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <Link href="/sign-in" className="text-sm font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Verifying email…</h1>
            <p className="text-sm text-muted-foreground">Confirming your address.</p>
          </>
        )}
      </div>
    </AuthPageShell>
  );
}
