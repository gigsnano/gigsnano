"use client";

import { useState } from "react";
import Link from "next/link";

import { useForgotPassword } from "@/hooks/auth/use-auth";
import { Button } from "@/components/ui/button";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ForgotPasswordForm() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await forgot.mutateAsync(email);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          If an account exists for {email}, we sent a reset link. Follow the link in the email to
          choose a new password.
        </p>
        <Link href="/sign-in" className="text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Reset your password</h1>
        <p className="text-sm text-muted-foreground">We&apos;ll email you a reset link.</p>
      </div>

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

      <Button type="submit" className="w-full" disabled={forgot.isPending}>
        {forgot.isPending ? "Sending…" : "Send reset link"}
      </Button>

      <Link href="/sign-in" className="text-center text-sm text-primary hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
