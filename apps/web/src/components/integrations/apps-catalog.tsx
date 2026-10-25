"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, ArrowLeft01Icon, Search01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  buildApprovalRequest,
  buildCatalogEntry,
  comparePermissions,
  consentBlockedReason,
  ECatalogSection,
  healthLabel,
  queryCatalog,
  type ICatalogEntry,
} from "@/lib/solutions/connectors";
import { CONNECTOR_FIXTURES } from "@/lib/solutions/connectors";
import { cn } from "@/lib/utils";
import { ECapabilityAccess, type IConnectorPolicyContext } from "@/types/solution/connector";

/**
 * Apps & Integrations catalog + contextual install (GIN-457).
 *
 * Discovery is organized by the outcome an integration unlocks. When the caller
 * arrives from a blocked step, `requestedCapabilities` narrows the catalog to
 * what actually unblocks them and `onInstalled` returns them to that step.
 */

const SECTION_TABS: { key: ECatalogSection | "policies"; label: string }[] = [
  { key: ECatalogSection.Discover, label: "Discover" },
  { key: ECatalogSection.Installed, label: "Installed" },
  { key: ECatalogSection.Requests, label: "Requests" },
  { key: "policies", label: "Admin policies" },
];

function CapabilityChip({
  label,
  access,
  permitted,
  reason,
}: {
  label: string;
  access: ECapabilityAccess;
  permitted: boolean;
  reason: string | null;
}) {
  return (
    <li
      title={reason ?? undefined}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px]",
        permitted
          ? access === ECapabilityAccess.Write
            ? "border-amber-500/40 text-amber-700 dark:text-amber-500"
            : "text-muted-foreground"
          : "border-dashed text-muted-foreground/60 line-through",
      )}
    >
      {label}
    </li>
  );
}

function CatalogCard({
  entry,
  onOpen,
}: {
  entry: ICatalogEntry;
  onOpen: () => void;
}) {
  return (
    <li className="rounded-lg border p-4 transition-colors hover:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{entry.manifest.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entry.manifest.provider} ·{" "}
            <span className={cn(entry.health?.action && "text-destructive")}>
              {healthLabel(entry)}
            </span>
            {entry.connection ? ` · ${entry.connection.scope}` : null}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onOpen}>
          {entry.connection ? "Manage" : "Review access"}
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">Unlocks</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {entry.capabilities.map((capability) => (
          <CapabilityChip
            key={capability.key}
            label={capability.label}
            access={capability.access}
            permitted={capability.permitted}
            reason={capability.denied_reason}
          />
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <div>
          <dt className="inline font-medium text-foreground/70">Reads: </dt>
          <dd className="inline">{entry.reads.join(", ") || "Nothing"}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground/70">Writes: </dt>
          <dd className="inline">{entry.writes.join(", ") || "Nothing"}</dd>
        </div>
      </dl>

      {entry.requires_admin ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Needs a workspace admin: {entry.manifest.admin_prerequisites.join("; ")}
        </p>
      ) : null}
    </li>
  );
}

function InstallDetail({
  entry,
  requestedCapabilities,
  isAdmin,
  originStep,
  containerId,
  containerLabel,
  onBack,
  onInstalled,
}: {
  entry: ICatalogEntry;
  requestedCapabilities: string[];
  isAdmin: boolean;
  originStep: string | null;
  containerId: string | null;
  containerLabel: string;
  onBack: () => void;
  onInstalled: (connectorKey: string) => void;
}) {
  const preselected =
    requestedCapabilities.length > 0
      ? requestedCapabilities
      : entry.capabilities.filter((c) => c.permitted && c.access === ECapabilityAccess.Read).map(
          (c) => c.key,
        );

  const [selected, setSelected] = useState<string[]>(preselected);
  const [justification, setJustification] = useState("");
  const [requested, setRequested] = useState(false);

  const delta = comparePermissions(entry, selected);
  const blocked = consentBlockedReason(entry, selected, isAdmin);
  const needsApproval = entry.requires_admin && !isAdmin;

  const toggle = (key: string) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={onBack}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
        Back to catalog
      </Button>

      <div>
        <h2 className="text-base font-medium">{entry.manifest.name}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {entry.manifest.provider}
          {originStep ? ` · requested by the "${originStep}" step` : null}
        </p>
      </div>

      <fieldset className="rounded-lg border p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Access you are granting
        </legend>
        <ul className="space-y-2">
          {entry.capabilities.map((capability) => {
            const granted = entry.connection?.granted_capabilities.includes(capability.key);
            return (
              <li key={capability.key} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id={`cap-${capability.key}`}
                  className="mt-1 size-3.5 accent-primary"
                  checked={selected.includes(capability.key)}
                  disabled={!capability.permitted}
                  onChange={() => toggle(capability.key)}
                />
                <label htmlFor={`cap-${capability.key}`} className="min-w-0 text-sm">
                  <span className={cn(!capability.permitted && "text-muted-foreground")}>
                    {capability.label}
                  </span>
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {capability.access} · {capability.risk} risk
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {capability.denied_reason ??
                      (granted ? "Already granted" : "New access") +
                        ` · ${capability.provider_scopes.join(", ")}`}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="rounded-md border bg-muted/20 p-3 text-xs">
        <p className="font-medium text-foreground">
          {delta.increases_access
            ? `${delta.added.length} new permission${delta.added.length === 1 ? "" : "s"}`
            : "No new permissions"}
          {delta.read_only ? " · read-only" : " · includes write access"}
        </p>
        {delta.removed.length > 0 ? (
          <p className="mt-1 text-muted-foreground">
            Already granted and kept: {delta.removed.join(", ")}
          </p>
        ) : null}
      </div>

      {needsApproval ? (
        <div>
          <label
            htmlFor="approval-justification"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Why do you need this?
          </label>
          <textarea
            id="approval-justification"
            rows={2}
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            placeholder="An admin sees this alongside the exact scopes."
            className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      ) : null}

      {blocked && !needsApproval ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
          {blocked}
        </p>
      ) : null}

      {requested ? (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">
          Sent to your workspace admins with the exact scopes (
          {buildApprovalRequest(entry, selected, {
            requestedBy: "you",
            containerId,
            containerLabel,
            originStep,
            justification,
          }).provider_scopes.join(", ")}
          ). We&apos;ll bring you back here once it is approved.
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Cancel
        </Button>
        {needsApproval ? (
          <Button
            type="button"
            disabled={selected.length === 0 || !justification.trim() || requested}
            onClick={() => setRequested(true)}
          >
            {requested ? "Request sent" : "Request admin approval"}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={blocked !== null}
            onClick={() => onInstalled(entry.manifest.key)}
          >
            Authorize and connect
          </Button>
        )}
      </div>
    </div>
  );
}

function AdminPolicies({ policy }: { policy: IConnectorPolicyContext }) {
  const rules: { label: string; values: string[] }[] = [
    { label: "Denied by organization", values: policy.organization_deny_capabilities ?? [] },
    { label: "Denied by workspace", values: policy.workspace_deny_capabilities ?? [] },
    { label: "Allowed for this solution", values: policy.solution_allowed_capabilities ?? [] },
  ].filter((rule) => rule.values.length > 0);

  if (rules.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No capability restrictions are in force. Every integration below offers its full
        capability set.
      </p>
    );
  }

  return (
    <dl className="space-y-3">
      {rules.map((rule) => (
        <div key={rule.label} className="rounded-lg border p-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {rule.label}
          </dt>
          <dd className="mt-1.5 flex flex-wrap gap-1">
            {rule.values.map((value) => (
              <span key={value} className="rounded-full border px-2 py-0.5 text-[11px] font-mono">
                {value}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AppsCatalog({
  policy = {},
  requestedCapabilities = [],
  originStep = null,
  containerId = null,
  containerLabel = "this workspace",
  isAdmin = true,
  onInstalled,
  onCancel,
}: {
  policy?: IConnectorPolicyContext;
  /** Capabilities a blocked step needs — narrows discovery to what unblocks it. */
  requestedCapabilities?: string[];
  originStep?: string | null;
  containerId?: string | null;
  containerLabel?: string;
  isAdmin?: boolean;
  /** Called after a successful connect; returns the caller to its origin. */
  onInstalled?: (connectorKey: string) => void;
  onCancel?: () => void;
}) {
  const contextual = requestedCapabilities.length > 0;

  const [tab, setTab] = useState<ECatalogSection | "policies">(ECatalogSection.Discover);
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const entries = CONNECTOR_FIXTURES.map((manifest) =>
    buildCatalogEntry(manifest, policy, null, null, requestedCapabilities),
  );

  const open = openKey ? entries.find((e) => e.manifest.key === openKey) : null;

  if (open) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <InstallDetail
          entry={open}
          requestedCapabilities={requestedCapabilities}
          isAdmin={isAdmin}
          originStep={originStep}
          containerId={containerId}
          containerLabel={containerLabel}
          onBack={() => setOpenKey(null)}
          onInstalled={(key) => {
            setOpenKey(null);
            onInstalled?.(key);
          }}
        />
      </div>
    );
  }

  const visible =
    tab === "policies"
      ? []
      : queryCatalog(entries, {
          section: tab,
          search,
          is_admin: isAdmin,
          requested_capabilities: contextual ? requestedCapabilities : undefined,
        });

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      {contextual ? (
        <p className="mb-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          Showing integrations that unlock{" "}
          <span className="font-medium">{requestedCapabilities.join(", ")}</span>
          {originStep ? ` for the "${originStep}" step` : null}. You&apos;ll come straight back
          when it&apos;s connected.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Catalog sections" className="flex gap-1">
          {SECTION_TABS.map((section) => (
            <button
              key={section.key}
              type="button"
              aria-current={tab === section.key ? "page" : undefined}
              onClick={() => setTab(section.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm transition-colors",
                tab === section.key
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {section.label}
            </button>
          ))}
        </nav>

        {tab !== "policies" ? (
          <div className="relative ml-auto">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <label className="sr-only" htmlFor="catalog-search">
              Search integrations
            </label>
            <input
              id="catalog-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search integrations"
              className="w-52 rounded-md border bg-background py-1 pl-7 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        {tab === "policies" ? (
          <AdminPolicies policy={policy} />
        ) : visible.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {tab === ECatalogSection.Installed
              ? "No integrations are connected yet. Discover one to get started."
              : tab === ECatalogSection.Requests
                ? "No pending approval requests."
                : "Nothing matches that search."}
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((entry) => (
              <CatalogCard
                key={entry.manifest.key}
                entry={entry}
                onOpen={() => setOpenKey(entry.manifest.key)}
              />
            ))}
          </ul>
        )}
      </div>

      {onCancel ? (
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {contextual ? "Back without connecting" : "Close"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
