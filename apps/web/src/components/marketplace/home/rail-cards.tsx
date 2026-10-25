"use client";

import { useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  PencilEdit02Icon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Shared right-rail card shell with an optional collapse chevron. */
function RailCard({
  title,
  children,
  collapsible = false,
  icon,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  const heading = (
    <span className="flex items-center gap-2 text-base font-semibold">
      {icon}
      {title}
    </span>
  );

  return (
    <section className="rounded-xl border bg-card p-5">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
        >
          {heading}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200 ease-out",
              open && "rotate-180",
            )}
          />
        </button>
      ) : (
        <div className="flex w-full items-center justify-between gap-2">{heading}</div>
      )}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** "Identity verification" nudge card (decorative CTA). */
export function VerificationCard() {
  return (
    <RailCard
      title="Identity verification"
      icon={<HugeiconsIcon icon={SecurityCheckIcon} className="size-4.5 text-primary" />}
    >
      <p className="text-sm text-muted-foreground">
        Increase your visibility in search results and win more work with a verified badge.
      </p>
      <button type="button" className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
        Get verified
      </button>
    </RailCard>
  );
}

function PromoteRow({ label }: { label: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">Off</p>
      </div>
      <button
        type="button"
        aria-label={`Edit ${label}`}
        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
      </button>
    </div>
  );
}

/** "Promote with ads" card — availability badge + boost rows (decorative). */
export function PromoteCard() {
  return (
    <RailCard title="Promote with ads" collapsible>
      <div className="flex flex-col divide-y">
        <PromoteRow label="Availability badge" />
        <PromoteRow label="Boost your profile" />
      </div>
    </RailCard>
  );
}

/** "Connects" balance card (decorative buy flow). */
export function ConnectsCard() {
  return (
    <RailCard title="Connects: 12" collapsible>
      <Button variant="outline" className="w-full rounded-full">
        Buy Connects
      </Button>
      <button type="button" className="mt-2.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
        View details
      </button>
    </RailCard>
  );
}

/** Collapsed disclosure rows (Preferences / Proposals / Project catalog). */
export function RailDisclosures() {
  return (
    <div className="flex flex-col">
      {[
        { label: "Preferences", body: "Job alerts, visibility and working hours will live here." },
        { label: "Proposals", body: "Track the jobs you've applied to." },
        { label: "Project catalog", body: "Package your services as ready-to-buy projects." },
      ].map((row) => (
        <RailDisclosure key={row.label} label={row.label}>
          {row.body}
        </RailDisclosure>
      ))}
    </div>
  );
}

function RailDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b px-1 py-3.5 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left text-base font-semibold transition-colors hover:text-primary"
      >
        {label}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200 ease-out",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <p className="pt-2 text-sm text-muted-foreground">{children}</p>
        </div>
      </div>
    </div>
  );
}
