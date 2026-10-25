"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { useAcceptTransfer, useDeclineTransfer, useTransferRequest } from "@/hooks/project/use-projects";
import { APIError } from "@/services/api-error";
import { Button } from "@/components/ui/button";

function errorCopy(err: unknown): { title: string; detail: string } {
  const status = err instanceof APIError ? err.status : 0;
  if (status === 403) {
    return {
      title: "This transfer isn't for this account",
      detail:
        "The transfer was sent to a different email. Sign in with the account that owns the destination workspace.",
    };
  }
  return {
    title: "This transfer link is no longer valid",
    detail: "It may have already been accepted, declined, cancelled, or expired.",
  };
}

/**
 * The destination owner's accept/decline screen for a project transfer (GIN-85),
 * reached from the email link at `/transfer-requests/[token]`.
 */
export function TransferRequestView({ token }: { token: string }) {
  const router = useRouter();
  const { data: req, isPending, isError, error } = useTransferRequest(token);
  const accept = useAcceptTransfer();
  const decline = useDeclineTransfer();
  const [declined, setDeclined] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const onAccept = () => {
    setActionError(null);
    accept.mutate(token, {
      onSuccess: (project) => router.push(`/${project.workspace_slug}/projects/${project.id}`),
      onError: (err) =>
        setActionError(
          err instanceof APIError && err.data && typeof err.data === "object" && "detail" in err.data
            ? String((err.data as { detail: unknown }).detail)
            : "Couldn't accept the transfer. Please try again.",
        ),
    });
  };

  const onDecline = () => {
    decline.mutate(token, { onSuccess: () => setDeclined(true) });
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-sm">
        {isPending ? (
          <p className="text-center text-sm text-muted-foreground">Loading transfer…</p>
        ) : isError || !req ? (
          <div className="text-center">
            <h1 className="text-base font-semibold">{errorCopy(error).title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{errorCopy(error).detail}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => router.push("/")}
            >
              Go home
            </Button>
          </div>
        ) : declined ? (
          <div className="text-center">
            <h1 className="text-base font-semibold">Transfer declined</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{req.project_name}</span> stays in{" "}
              {req.source_workspace_name}.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => router.push("/")}
            >
              Go home
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-base font-semibold">Accept project transfer</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;ve been asked to accept a project into{" "}
              <span className="font-medium text-foreground">{req.dest_workspace_name}</span>.
            </p>

            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-semibold">
                {req.project_name}{" "}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {req.project_identifier}
                </span>
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <span>{req.source_workspace_name}</span>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0" />
                <span className="font-medium text-foreground">{req.dest_workspace_name}</span>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              All work items, documents, attachments, and history move with the project.
            </p>

            {actionError ? (
              <p className="mt-3 text-sm text-destructive">{actionError}</p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={decline.isPending || accept.isPending}
                onClick={onDecline}
              >
                {decline.isPending ? "Declining…" : "Decline"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={accept.isPending || decline.isPending}
                onClick={onAccept}
              >
                {accept.isPending ? "Accepting…" : "Accept transfer"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
