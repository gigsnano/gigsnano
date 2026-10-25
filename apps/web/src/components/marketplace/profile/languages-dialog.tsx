"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LANGUAGE_PROFICIENCIES, MARKETPLACE_LANGUAGES } from "@/constants/marketplace";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

const field =
  "h-9 rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Controlled dialog for the sidebar "Languages" entry: lists current
 * languages with a remove affordance, plus an add row (free-text name with
 * vocabulary suggestions + a proficiency select).
 */
export function LanguagesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const languages = useMarketplaceProfileStore((s) => s.languages);
  const addLanguage = useMarketplaceProfileStore((s) => s.addLanguage);
  const removeLanguage = useMarketplaceProfileStore((s) => s.removeLanguage);
  const [name, setName] = useState("");
  const [proficiency, setProficiency] = useState<string>(LANGUAGE_PROFICIENCIES[2]);

  const add = () => {
    const n = name.trim();
    if (!n) return;
    addLanguage({ name: n, proficiency });
    setName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">Languages</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          Add the languages you work in and your proficiency.
        </DialogDescription>

        <ul className="mt-4 flex flex-col divide-y">
          {languages.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">No languages yet.</li>
          )}
          {languages.map((l, i) => (
            <li
              key={l.name}
              className="flex animate-in items-center justify-between gap-3 fade-in slide-in-from-top-1 py-2 text-sm duration-200"
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms`, animationFillMode: "backwards" }}
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{l.name}</span>: {l.proficiency}
              </span>
              <button
                type="button"
                aria-label={`Remove ${l.name}`}
                onClick={() => removeLanguage(l.name)}
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-90"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
            Language
            <input
              list="mp-languages"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="English"
              className={field}
            />
            <datalist id="mp-languages">
              {MARKETPLACE_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Proficiency
            <select
              value={proficiency}
              onChange={(e) => setProficiency(e.target.value)}
              className={`${field} cursor-pointer`}
            >
              {LANGUAGE_PROFICIENCIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <Button onClick={add} disabled={!name.trim()}>
            Add
          </Button>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
