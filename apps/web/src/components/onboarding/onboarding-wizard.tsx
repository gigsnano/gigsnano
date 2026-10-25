"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { CreateWorkspaceForm } from "@/components/auth/create-workspace-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";

const STEPS = [
  {
    title: "Welcome to GigsNano",
    body: "A lighter alternative to Jira — with specialized AI agents embedded directly in your agile workflow.",
    lines: ["Plan with BMAD", "Ship with agents", "Review in Docs"],
  },
  {
    title: "Sprint-0 does the heavy lifting",
    body: "Every new project starts with an opinionated planning board. Each card opens a fresh agent chat that produces real artifacts.",
    lines: ["10 BMAD steps", "Strict unlock order", "Brownfield or greenfield"],
  },
] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const isForm = step === 2;

  if (isForm) {
    return (
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
            ← Back
          </Button>
        </div>
        <CreateWorkspaceForm
          onCreated={(slug) => router.push(`/${slug}`)}
          className="border-0 bg-transparent p-0 shadow-none"
        />
      </div>
    );
  }

  const current = STEPS[step];

  return (
    <div className="w-full max-w-lg">
      <div className="mb-6 flex justify-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-250 ease-out",
              i === step ? "w-8 bg-primary" : "w-1.5 bg-muted-foreground/30",
            )}
          />
        ))}
      </div>

      <div key={step} className="t-stagger rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HugeiconsIcon icon={SparklesIcon} className="size-5" />
        </div>
        <h1 className="t-stagger-line text-xl font-semibold">{current.title}</h1>
        <p className="t-stagger-line mt-2 text-sm leading-relaxed text-muted-foreground">
          {current.body}
        </p>
        <ul className="mt-4 space-y-1.5">
          {current.lines.map((line) => (
            <li key={line} className="t-stagger-line flex items-center gap-2 text-sm">
              <span className="size-1.5 rounded-full bg-primary" />
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
          className="active:scale-[0.97]"
        >
          Back
        </Button>
        <Button type="button" onClick={() => setStep((s) => s + 1)} className="active:scale-[0.97]">
          {step === 1 ? "Create workspace" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
