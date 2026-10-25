"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";
import type { EMarketplaceRole } from "@/types";
import { EMarketplaceRole as ERole } from "@/types";

import { DoneStep } from "./done-step";
import { ProfileStep } from "./profile-step";
import { EMPTY_PROFILE_FORM, type IProfileFormValues } from "./profile-form";
import { RoleSelectStep } from "./role-select-step";

const STEPS = ["Account type", "Profile", "Done"] as const;

// Each step re-mounts via `key={step}` so the entrance replays (ease-out,
// sub-300ms, gated behind motion-safe — emil-design-eng entering rules).
const STEP_ENTER =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out";

export function OnboardingFlow() {
  const completeOnboarding = useMarketplaceProfileStore((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<EMarketplaceRole | null>(null);
  const [form, setForm] = useState<IProfileFormValues>(EMPTY_PROFILE_FORM);

  const finish = () => {
    if (!role) return;
    completeOnboarding({
      role,
      display_name: form.display_name.trim(),
      ...(role === ERole.Freelancer
        ? {
            title: form.title.trim(),
            hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
            skills: form.skills,
          }
        : {
            company_name: form.company_name.trim(),
            industry: form.industry,
            company_size: form.company_size,
          }),
    });
    setStep(2);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 py-8">
      <ol className="flex items-center justify-center gap-2" aria-label="Onboarding progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out",
              i === step ? "w-8 bg-primary" : "w-4",
              i < step ? "bg-primary/50" : i > step ? "bg-muted-foreground/20" : "",
            )}
          >
            <span className="sr-only">{label}</span>
          </li>
        ))}
      </ol>

      <div key={step} className={STEP_ENTER}>
        {step === 0 && (
          <RoleSelectStep role={role} onSelect={setRole} onContinue={() => setStep(1)} />
        )}
        {step === 1 && role && (
          <ProfileStep
            role={role}
            values={form}
            onChange={setForm}
            onBack={() => setStep(0)}
            onContinue={finish}
          />
        )}
        {step === 2 && role && <DoneStep role={role} displayName={form.display_name.trim()} />}
      </div>
    </div>
  );
}
