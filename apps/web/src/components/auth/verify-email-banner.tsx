"use client";

import { useState } from "react";

import { useAuthUser, useRequestVerifyEmail } from "@/hooks/auth/use-auth";
import { Button } from "@/components/ui/button";

export function VerifyEmailBanner() {
  const { data: user } = useAuthUser();
  const request = useRequestVerifyEmail();
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.email_verified || dismissed) {
    return null;
  }

  const onResend = async () => {
    await request.mutateAsync();
    setSent(true);
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm"
    >
      <p className="text-foreground">
        {sent
          ? "Verification email sent — check your inbox."
          : "Verify your email address to secure your account."}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={request.isPending || sent}
          onClick={onResend}
        >
          {request.isPending ? "Sending…" : sent ? "Sent" : "Resend verification"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
