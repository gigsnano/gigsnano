"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useResetPassword } from "@/hooks/auth/use-auth";
import { Button } from "@/components/ui/button";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reset = useResetPassword();
  const [token, setToken] = useState(() => searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);


  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token.trim()) {
      setError("Paste the reset token from your email.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await reset.mutateAsync({ token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    }
  };

  if (done) {
    return (
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-lg font-semibold">Password updated</h1>
        <p className="text-sm text-muted-foreground">You can sign in with your new password.</p>
        <Button className="w-full active:scale-[0.97]" onClick={() => router.push("/sign-in")}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold">Reset password</h1>
        <p className="text-sm text-muted-foreground">Choose a new password for your account.</p>
      </div>
      {!searchParams.get("token") ? (
        <input
          aria-label="Reset token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste token from email"
          className={field}
          required
        />
      ) : null}
      <input
        aria-label="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="New password"
        className={field}
        minLength={8}
        required
      />
      <input
        aria-label="Confirm password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm password"
        className={field}
        minLength={8}
        required
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full active:scale-[0.97]" disabled={reset.isPending}>
        {reset.isPending ? "Saving…" : "Reset password"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/sign-in" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
