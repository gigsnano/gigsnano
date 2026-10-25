"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTokens } from "@/hooks/tokens/use-tokens";

import { CreateTokenDialog } from "./create-token-dialog";
import { ConnectedAppsPanel } from "./connected-apps-panel";
import { TokenRow } from "./token-row";

/**
 * "Developer tokens" account-settings panel. Renders loading / empty (with a
 * CTA) / populated from one hook. The header + empty-state actions open the
 * create-token dialog (one-time reveal); the populated list shows masked rows
 * with a guarded revoke, entering on the shared `.t-doc-row` staggered reveal.
 */
export function TokensPanel() {
  const { data, isPending, isSuccess } = useTokens();
  const [createOpen, setCreateOpen] = useState(false);

  const hasTokens = isSuccess && data.length > 0;

  return (
    <div className="max-w-2xl px-10 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Developer tokens</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Personal access tokens authenticate API requests as you. Treat them like passwords.
          </p>
        </div>
        {hasTokens ? (
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="shrink-0 transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Create token
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <div className="mt-6 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : hasTokens ? (
        <ul className="t-token-list mt-6 divide-y overflow-hidden rounded-lg border">
          {data.map((token) => (
            <li key={token.id} className="t-doc-row">
              <TokenRow token={token} />
            </li>
          ))}
        </ul>
      ) : isSuccess ? (
        <EmptyState
          className="mt-6"
          title="No developer tokens yet"
          description="Create a personal access token to authenticate API requests as you."
          actions={[{ label: "Create token", onClick: () => setCreateOpen(true) }]}
        />
      ) : null}

      <CreateTokenDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConnectedAppsPanel />
    </div>
  );
}
