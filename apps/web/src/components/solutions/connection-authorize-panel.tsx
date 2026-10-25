"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, Link01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  useCompleteConnectionCallback,
  useRequestConnection,
} from "@/hooks/solution/use-solution-runtime";
import { githubConnector } from "@/lib/solutions/connectors";
import { canUseConnection, recoveryInstructions } from "@/lib/solutions/connections";
import { EConnectionScope, EConnectionStatus, type IConnection } from "@/types";

/**
 * Authorize a connector during intake (GIN-456). Mock callback simulates OAuth
 * without exposing credentials — only opaque auth_ref lands on the connection.
 */

export function ConnectionAuthorizePanel({
  workspaceSlug,
  onConnected,
  onSkip,
  onCancel,
}: {
  workspaceSlug: string;
  onConnected: (connection: IConnection) => void;
  onSkip?: () => void;
  onCancel: () => void;
}) {
  const request = useRequestConnection(workspaceSlug);
  const callback = useCompleteConnectionCallback(workspaceSlug);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    connectionId: string;
    state: string;
  } | null>(null);

  const authorize = () => {
    setError(null);
    request.mutate(
      {
        connector_key: githubConnector.key,
        connector_version: githubConnector.version,
        scope: EConnectionScope.Workspace,
        requested_capabilities: ["repos.read"],
        read_only: true,
      },
      {
        onSuccess: (req) => {
          setPending({ connectionId: req.connection_id, state: req.state });
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Could not start authorization.");
        },
      },
    );
  };

  const simulateCallback = () => {
    if (!pending) return;
    setError(null);
    callback.mutate(
      {
        connectionId: pending.connectionId,
        state: pending.state,
        idempotency_key: `mock-${pending.connectionId}`,
        provider_account: "mock-org",
        provider_tenant: "mock-tenant",
      },
      {
        onSuccess: (conn) => {
          if (!canUseConnection(conn)) {
            setError(recoveryInstructions(conn) ?? "Connection is not usable yet.");
            return;
          }
          onConnected(conn);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Authorization failed.");
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-muted">
            <HugeiconsIcon icon={Link01Icon} className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{githubConnector.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Least-privilege read access to repositories. Credentials never appear in the app —
              only an opaque auth reference is stored.
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {githubConnector.capabilities
                .filter((c) => c.key === "repos.read")
                .map((c) => (
                  <li key={c.key}>
                    · {c.label} ({c.access})
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>

      {pending ? (
        <p
          role="status"
          className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          Status: <span className="font-medium text-foreground">{EConnectionStatus.Authorizing}</span>
          . Complete the provider consent (simulated below in mock mode).
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="t-error is-shaking flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {onSkip ? (
          <Button type="button" variant="outline" onClick={onSkip}>
            Skip for now
          </Button>
        ) : null}
        {!pending ? (
          <Button type="button" disabled={request.isPending} onClick={authorize}>
            {request.isPending ? "Starting…" : "Authorize GitHub"}
          </Button>
        ) : (
          <Button type="button" disabled={callback.isPending} onClick={simulateCallback}>
            {callback.isPending ? "Connecting…" : "Complete authorization"}
          </Button>
        )}
      </div>
    </div>
  );
}
