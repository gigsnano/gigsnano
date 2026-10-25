"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useRegeneratePublicLink,
  useShareDashboard,
} from "@/hooks/workspace/use-dashboards";
import { authErrorMessage } from "@/lib/auth/auth-error";
import { publicDashboardUrl } from "@/lib/dashboards/public-link";
import { cn } from "@/lib/utils";
import { EDashboardVisibility, type IDashboard } from "@/types";

import { blockedPublicWidgetLabels } from "./widgets/widget-registry";

/**
 * Publish / unpublish a dashboard (GIN-489).
 *
 * Publishing is deliberately a two-step read: the owner is told which widgets a
 * visitor will NOT see before they commit, because the alternative — silently
 * publishing a board whose personal widgets vanish — is how people end up
 * believing they shared something they didn't.
 */
export function ShareDashboardDialog({
  open,
  onOpenChange,
  dashboard,
  workspaceSlug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard: IDashboard;
  workspaceSlug: string;
}) {
  const share = useShareDashboard(workspaceSlug);
  const regenerate = useRegeneratePublicLink(workspaceSlug);

  const current = dashboard.visibility;
  const isPublic = current === EDashboardVisibility.Public;
  const blocked = blockedPublicWidgetLabels(dashboard.config.widgets);
  const shareableCount = dashboard.config.widgets.length - blocked.length;
  const pending = share.isPending || regenerate.isPending;
  const error = share.error ?? regenerate.error;

  const setVisibility = (visibility: EDashboardVisibility) => {
    if (pending || visibility === current) return;
    share.mutate({ dashboardId: dashboard.id, visibility });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Share dashboard</DialogTitle>
        <DialogDescription>
          Choose who can open <span className="font-medium text-foreground">{dashboard.name}</span>.
        </DialogDescription>

        <fieldset className="mt-4 flex flex-col gap-2" disabled={pending}>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Visibility
          </legend>
          <VisibilityOption
            name={`visibility-${dashboard.id}`}
            checked={current === EDashboardVisibility.Private}
            onSelect={() => setVisibility(EDashboardVisibility.Private)}
            label="Private"
            hint="Only you can open it."
          />
          <VisibilityOption
            name={`visibility-${dashboard.id}`}
            checked={current === EDashboardVisibility.Shared}
            onSelect={() => setVisibility(EDashboardVisibility.Shared)}
            label="Shared with the workspace"
            hint="Everyone in this workspace can open it. No link, and they can't edit it."
          />
          <VisibilityOption
            name={`visibility-${dashboard.id}`}
            checked={isPublic}
            onSelect={() => setVisibility(EDashboardVisibility.Public)}
            label="Public"
            hint="Anyone with the link can view it, without signing in."
          />
        </fieldset>

        {blocked.length > 0 ? (
          <p className="mt-3 flex gap-2 rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Alert02Icon} className="mt-px size-4 shrink-0" />
            <span>
              {shareableCount === 0 ? (
                <>
                  This dashboard can&apos;t be made <em>public</em>: none of its widgets can be
                  shown to anonymous visitors. Remove or replace {blocked.join(", ")} — or share
                  it with the workspace instead, which has no such limit.
                </>
              ) : (
                <>
                  Visitors won&apos;t see {blocked.join(", ")} — those widgets show personal or
                  per-person data. The other {shareableCount} will be visible.
                </>
              )}
            </span>
          </p>
        ) : null}

        {isPublic && dashboard.public_token ? (
          <PublicLinkPanel
            url={publicDashboardUrl(dashboard.public_token)}
            pending={pending}
            onRegenerate={() => regenerate.mutate(dashboard.id)}
            onDisable={() => setVisibility(EDashboardVisibility.Private)}
          />
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {authErrorMessage(error)}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VisibilityOption({
  name,
  checked,
  onSelect,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
        checked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function PublicLinkPanel({
  url,
  pending,
  onRegenerate,
  onDisable,
}: {
  url: string;
  pending: boolean;
  onRegenerate: () => void;
  onDisable: () => void;
}) {
  // Inline confirmation — the app has no toast layer; the button label reports
  // the copy itself. One timer, reset per copy and cleared on unmount.
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  return (
    <div className="mt-4 rounded-lg border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Public link
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          readOnly
          aria-label="Public dashboard link"
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded-md border bg-muted/40 px-2.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button size="sm" variant="secondary" onClick={copy}>
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-4" />
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Visitors get a read-only view. Search-engine indexing is disabled.
      </p>
      <div className="mt-3 flex justify-between gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={onRegenerate}>
          Regenerate link
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onDisable}>
          Disable public
        </Button>
      </div>
    </div>
  );
}
