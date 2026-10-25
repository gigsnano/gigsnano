"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Briefcase01Icon, UserSearch01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EMarketplaceRole } from "@/types";

const ROLE_CARDS = [
  {
    role: EMarketplaceRole.Client,
    icon: Briefcase01Icon,
    label: "I'm a client, hiring for a project",
  },
  {
    role: EMarketplaceRole.Freelancer,
    icon: UserSearch01Icon,
    label: "I'm a freelancer, looking for work",
  },
] as const;

export function RoleSelectStep({
  role,
  onSelect,
  onContinue,
}: {
  role: EMarketplaceRole | null;
  onSelect: (role: EMarketplaceRole) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-8">
      <h1 className="text-center text-2xl font-semibold tracking-tight">
        Join as a client or freelancer
      </h1>

      <div className="grid w-full gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Account type">
        {ROLE_CARDS.map((card) => {
          const selected = role === card.role;
          return (
            <button
              key={card.role}
              type="button"
              role="radio"
              aria-checked={selected}
              data-selected={selected}
              onClick={() => onSelect(card.role)}
              className={cn(
                "group relative flex flex-col gap-8 rounded-xl border bg-card p-5 text-left transition-[border-color,background-color,transform] duration-150 ease-out",
                "hover:border-ring/60 active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected && "border-primary bg-primary/5 hover:border-primary",
              )}
            >
              <span className="flex items-start justify-between">
                <HugeiconsIcon icon={card.icon} className="size-6 text-foreground" />
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border transition-colors",
                    selected ? "border-primary" : "border-muted-foreground/40",
                  )}
                  aria-hidden
                >
                  <span
                    className={cn(
                      "size-2 rounded-full bg-primary transition-transform duration-150 ease-out",
                      selected ? "scale-100" : "scale-0",
                    )}
                  />
                </span>
              </span>
              <span className="text-base font-medium leading-snug">{card.label}</span>
            </button>
          );
        })}
      </div>

      <Button size="lg" className="min-w-56" disabled={!role} onClick={onContinue}>
        {role === EMarketplaceRole.Client
          ? "Join as a Client"
          : role === EMarketplaceRole.Freelancer
            ? "Apply as a Freelancer"
            : "Create account"}
      </Button>
    </div>
  );
}
