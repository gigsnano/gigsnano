"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon, Alert02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateToken } from "@/hooks/tokens/use-tokens";
import type { ICreatedToken } from "@/types";

/** How long the "Copied" check holds before the button reverts to "Copy". */
const COPIED_HOLD_MS = 1600;
/** Matches DialogContent's close animation so the plaintext is discarded
 *  only after the dialog has visually left the screen. */
const RESET_DELAY_MS = 200;

/**
 * Two phases inside one dialog:
 *   1. name form  — enter a label, submit via `useCreateToken`
 *   2. reveal     — the plaintext token is shown ONCE (monospace, selectable),
 *                   with a Copy button + a "won't be shown again" warning.
 *
 * Closing discards the plaintext (reset after the close transition). The
 * incoming phase blur-fades in (`.t-token-phase`) so the swap crossfades
 * rather than hard-cutting.
 */
export function CreateTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateToken();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<ICreatedToken | null>(null);
  const [copied, setCopied] = useState(false);

  const copyTimer = useRef<number | null>(null);
  // Latch so the Copy affordance is focused exactly once when the reveal phase
  // mounts (emil: manage focus on phase change) — done via a callback ref, not
  // an effect, and reset on close.
  const revealFocused = useRef(false);
  // Monotonic submission id — a late resolution whose id no longer matches the
  // current one (because the dialog was cancelled/closed) must NOT set `created`.
  // `useMutation().reset()` does not abort the in-flight request, so without
  // this guard a cancel-while-pending would resurrect the discarded plaintext.
  const submissionRef = useRef(0);

  // Clean up the pending "Copied" revert if the dialog unmounts mid-hold.
  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    const attempt = ++submissionRef.current;
    create.mutate(
      { name: trimmed },
      {
        // Ignore a resolution whose submission was cancelled/closed in the
        // meantime — otherwise a late success repopulates the discarded token.
        onSuccess: (result) => {
          if (submissionRef.current === attempt) setCreated(result);
        },
      },
    );
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, COPIED_HOLD_MS);
    } catch {
      /* clipboard access can be denied — the field stays selectable to copy by hand */
    }
  };

  const close = () => {
    // Invalidate any in-flight submission so its late resolution can't set
    // `created` after we discard the plaintext (reset() does not abort it).
    submissionRef.current++;
    onOpenChange(false);
    // Discard the plaintext only after the close animation, so it never
    // flickers back to the form phase while the dialog is still visible.
    window.setTimeout(() => {
      setCreated(null);
      setName("");
      setCopied(false);
      create.reset();
      // Flip the focus guard only once the reveal JSX actually reverts to the
      // form phase — resetting it synchronously would let a re-render during
      // the close window refocus the Copy button, fighting Radix return-focus.
      revealFocused.current = false;
    }, RESET_DELAY_MS);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {created ? (
          <div key="reveal" className="t-token-phase flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Copy your token</DialogTitle>
              <DialogDescription>
                Use this token to authenticate API requests as you. Treat it like a password.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={created.token}
                aria-label="New personal access token"
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <Button
                ref={(el) => {
                  // Focus the primary action once, when the reveal first mounts.
                  if (el && !revealFocused.current) {
                    revealFocused.current = true;
                    el.focus();
                  }
                }}
                type="button"
                onClick={copy}
                aria-label={copied ? "Token copied" : "Copy token"}
                className="t-icon-swap shrink-0 transition-transform duration-150 ease-out active:scale-[0.97]"
                data-state={copied ? "b" : "a"}
              >
                <span className="t-icon inline-flex items-center gap-1.5" data-icon="a">
                  <HugeiconsIcon icon={Copy01Icon} className="size-4" />
                  Copy
                </span>
                <span className="t-icon inline-flex items-center gap-1.5" data-icon="b">
                  <HugeiconsIcon icon={Tick02Icon} className="size-4" />
                  Copied
                </span>
              </Button>
            </div>

            <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <HugeiconsIcon
                icon={Alert02Icon}
                className="mt-px size-4 shrink-0 text-foreground/70"
              />
              <p>
                Make sure to copy it now. For your security,{" "}
                <span className="font-medium text-foreground">
                  you won&apos;t be able to see it again.
                </span>
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                onClick={close}
                className="transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div key="form" className="t-token-phase flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Create developer token</DialogTitle>
              <DialogDescription>
                Give this token a name so you can recognise it later. The token itself is shown
                once, right after you create it.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="token-name">Token name</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                placeholder="e.g. CLI on my laptop"
                autoComplete="off"
                aria-invalid={!!create.error}
              />
              {create.error ? (
                <p className="text-xs text-destructive">
                  Couldn&apos;t create the token. Please try again.
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={create.isPending}
                className="transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!name.trim() || create.isPending}
                onClick={submit}
                className="transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                {create.isPending ? "Creating…" : "Create token"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
