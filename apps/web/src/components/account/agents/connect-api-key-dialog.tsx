"use client";

import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

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
import { authErrorMessage } from "@/lib/auth/auth-error";
import type { IAgentConnection } from "@/types/ai/agent-delegation";

/** Shared BYO API-key connect dialog (Cursor, Claude, …). The provider differs
 * only in copy + the key-source link; the verify→store→close flow is identical. */
export function ConnectApiKeyDialog({
  open,
  onOpenChange,
  title,
  placeholder,
  keyHelp,
  mutation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  placeholder: string;
  keyHelp: React.ReactNode;
  mutation: UseMutationResult<IAgentConnection, unknown, string>;
}) {
  const [apiKey, setApiKey] = useState("");
  const error = mutation.error ? authErrorMessage(mutation.error) : null;

  const submit = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    mutation.mutate(trimmed, {
      onSuccess: () => {
        setApiKey("");
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {keyHelp} The key is encrypted server-side and never shown again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            type="password"
            autoComplete="off"
            placeholder={placeholder}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            aria-invalid={!!error}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="transition-transform duration-150 ease-out active:scale-[0.97]"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={!apiKey.trim() || mutation.isPending}
            className="transition-transform duration-150 ease-out active:scale-[0.97]"
            onClick={submit}
          >
            {mutation.isPending ? "Verifying…" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
