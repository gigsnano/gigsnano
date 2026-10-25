"use client";

import { useState, type KeyboardEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  MARKETPLACE_COMPANY_SIZES,
  MARKETPLACE_INDUSTRIES,
  MARKETPLACE_SKILLS,
} from "@/constants/marketplace";
import { EMarketplaceRole } from "@/types";

import type { IProfileFormValues } from "./profile-form";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const MAX_SKILLS = 10;

function isProfileFormValid(role: EMarketplaceRole, v: IProfileFormValues): boolean {
  if (!v.display_name.trim()) return false;
  if (role === EMarketplaceRole.Freelancer) return Boolean(v.title.trim());
  return Boolean(v.company_name.trim());
}

export function ProfileStep({
  role,
  values,
  onChange,
  onBack,
  onContinue,
}: {
  role: EMarketplaceRole;
  values: IProfileFormValues;
  onChange: (values: IProfileFormValues) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [skillDraft, setSkillDraft] = useState("");
  const freelancer = role === EMarketplaceRole.Freelancer;

  const set = <K extends keyof IProfileFormValues>(key: K, value: IProfileFormValues[K]) =>
    onChange({ ...values, [key]: value });

  const addSkill = (raw: string) => {
    const skill = raw.trim();
    if (!skill || values.skills.length >= MAX_SKILLS) return;
    if (values.skills.some((s) => s.toLowerCase() === skill.toLowerCase())) return;
    set("skills", [...values.skills, skill]);
    setSkillDraft("");
  };

  const onSkillKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill(skillDraft);
    } else if (e.key === "Backspace" && !skillDraft && values.skills.length) {
      set("skills", values.skills.slice(0, -1));
    }
  };

  const suggestions = MARKETPLACE_SKILLS.filter(
    (s) =>
      !values.skills.includes(s) &&
      (!skillDraft || s.toLowerCase().includes(skillDraft.toLowerCase())),
  ).slice(0, 6);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {freelancer ? "Tell clients about yourself" : "Tell us about your company"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {freelancer
            ? "This appears on your proposals and profile."
            : "This helps freelancers understand who they're working with."}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Display name
          <input
            type="text"
            required
            value={values.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            placeholder="Ada Lovelace"
            className={field}
          />
        </label>

        {freelancer ? (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Professional title
              <input
                type="text"
                required
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Full Stack Developer | React | Node.js"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Hourly rate
              <span className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  min={1}
                  value={values.hourly_rate}
                  onChange={(e) => set("hourly_rate", e.target.value)}
                  placeholder="45"
                  className={`${field} pl-7 pr-12`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                  /hr
                </span>
              </span>
            </label>

            <div className="flex flex-col gap-1.5 text-sm font-medium">
              <span>
                Skills{" "}
                <span className="font-normal text-muted-foreground">
                  ({values.skills.length}/{MAX_SKILLS})
                </span>
              </span>
              <div className={`${field} flex h-auto min-h-9 flex-wrap items-center gap-1.5 py-1.5`}>
                {values.skills.map((skill) => (
                  <span
                    key={skill}
                    className="flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 text-xs font-medium text-secondary-foreground"
                  >
                    {skill}
                    <button
                      type="button"
                      aria-label={`Remove ${skill}`}
                      onClick={() => set("skills", values.skills.filter((s) => s !== skill))}
                      className="flex size-4 items-center justify-center rounded-full transition-colors hover:bg-foreground/10"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
                    </button>
                  </span>
                ))}
                {values.skills.length < MAX_SKILLS && (
                  <>
                    <Label id="profile-skills-input-label" htmlFor="profile-skills-input" className="sr-only">
                      Add skill
                    </Label>
                    <input
                      id="profile-skills-input"
                      aria-labelledby="profile-skills-input-label"
                      type="text"
                      value={skillDraft}
                      onChange={(e) => setSkillDraft(e.target.value)}
                      onKeyDown={onSkillKeyDown}
                      placeholder={values.skills.length ? "" : "Type a skill and press Enter"}
                      className="min-w-24 flex-1 bg-transparent text-sm font-normal outline-none placeholder:text-muted-foreground"
                    />
                  </>
                )}
              </div>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5" aria-label="Suggested skills">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addSkill(s)}
                      className="rounded-full border px-2.5 py-0.5 text-xs font-normal text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Company name
              <input
                type="text"
                required
                value={values.company_name}
                onChange={(e) => set("company_name", e.target.value)}
                placeholder="Acme Corp"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Industry
              <select
                value={values.industry}
                onChange={(e) => set("industry", e.target.value)}
                className={`${field} cursor-pointer`}
              >
                {MARKETPLACE_INDUSTRIES.map((industry) => (
                  <option key={industry}>{industry}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Company size
              <select
                value={values.company_size}
                onChange={(e) => set("company_size", e.target.value)}
                className={`${field} cursor-pointer`}
              >
                {MARKETPLACE_COMPANY_SIZES.map((size) => (
                  <option key={size}>{size}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          size="lg"
          className="min-w-40"
          disabled={!isProfileFormValid(role, values)}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
