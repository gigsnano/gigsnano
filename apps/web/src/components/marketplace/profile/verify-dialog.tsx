"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkBadge01Icon, Loading03Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EVerifyStatus, useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

const LABELS: Record<EVerifyStatus, string> = {
  [EVerifyStatus.Unverified]: "Not verified",
  [EVerifyStatus.Pending]: "Verifying…",
  [EVerifyStatus.Verified]: "Verified",
};

/** Simulated verification delay — no backend for the marketplace yet. */
const VERIFY_DELAY_MS = 1200;

function VerifyRow({ kind, label }: { kind: "identity" | "phone"; label: string }) {
  const status = useMarketplaceProfileStore((s) =>
    kind === "identity" ? s.identity_verification : s.phone_verification,
  );
  const setVerification = useMarketplaceProfileStore((s) => s.setVerification);
  const [busy, setBusy] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const verify = () => {
    setBusy(true);
    setVerification(kind, EVerifyStatus.Pending);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    // Simulated verification — no backend. Resolves to Verified.
    timeoutRef.current = window.setTimeout(() => {
      setVerification(kind, EVerifyStatus.Verified);
      setBusy(false);
      timeoutRef.current = null;
    }, VERIFY_DELAY_MS);
  };

  const verified = status === EVerifyStatus.Verified;
  return (
    <div className="flex items-center justify-between gap-3 border-t py-3 first:border-t-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className={cn("text-xs transition-colors", verified ? "text-primary" : "text-muted-foreground")}>
          {LABELS[status]}
        </p>
      </div>
      {verified ? (
        // Solid badge, fade+scale reveal on mount — CheckmarkBadge01Icon is a
        // multi-path Hugeicons SVG, so it must NOT use `.t-success-check`
        // (that class's stroke-dasharray/-dashoffset was hand-tuned for the
        // single-path done-step check and renders this badge permanently
        // dashed/broken).
        <HugeiconsIcon
          icon={CheckmarkBadge01Icon}
          className="size-5 text-primary animate-in fade-in zoom-in-50 duration-300"
        />
      ) : (
        <Button size="sm" onClick={verify} disabled={busy}>
          {busy && <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />}
          Verify
        </Button>
      )}
    </div>
  );
}

/**
 * Simulated identity-verification flow ("Verify your identity"
 * dialog). Each row runs Unverified -> Pending -> Verified locally via
 * `setVerification`; there is no backend for the marketplace domain yet.
 */
export function VerifyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">Verify your identity</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          Verified profiles rank higher in search and win more work.
        </DialogDescription>
        <div className="mt-4">
          <VerifyRow kind="identity" label="Government ID" />
          <VerifyRow kind="phone" label="Phone number" />
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
