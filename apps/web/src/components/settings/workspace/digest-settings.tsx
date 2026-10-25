"use client";

import { useState } from "react";

import {
  useDigestPreferences,
  useUpdateDigestPreferences,
} from "@/hooks/workspace/use-digest-preferences";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { STORY_STATUS_META, STORY_STATUS_ORDER } from "@/constants/story-meta";
import { cn } from "@/lib/utils";
import {
  UTC,
  detectTimezone,
  formatHour,
  hourInViewerTime,
  timezoneOptions,
} from "@/lib/format/timezone";
import { EDigestTemplate, EStoryStatus } from "@/types";
import type { IDigestPreference, TDigestChannel } from "@/types";

// Mon=0 … Sun=6, matching Python's weekday() (the backend's digest_weekdays).
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const TEMPLATES: { value: EDigestTemplate; label: string; hint: string }[] = [
  { value: EDigestTemplate.Default, label: "Default", hint: "Ordered by due date" },
  { value: EDigestTemplate.Manager, label: "Manager", hint: "Cycle health — what's at risk first" },
  {
    value: EDigestTemplate.Developer,
    label: "Developer",
    hint: "Blockers & dependencies first",
  },
  { value: EDigestTemplate.Pm, label: "Product manager", hint: "Upcoming milestones first" },
];

const CHANNELS: { value: TDigestChannel; label: string; hint?: string; disabled?: boolean }[] = [
  { value: "in_app", label: "In-app" },
  { value: "email", label: "Email" },
  { value: "slack", label: "Slack", hint: "Coming soon", disabled: true },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Seed the form with the browser's timezone (GIN-127) when the stored value is
 * still the server default. Runs in a useState initializer, not an effect: on
 * the server `Intl` reports the *host's* zone, and detecting in an effect would
 * both flash the wrong value and trip react-doctor's setState-in-effect rule.
 *
 * The heuristic can't tell "never set" from "deliberately chose UTC" — both
 * arrive as "UTC". Someone who genuinely wants UTC while sitting in another zone
 * sees it proposed again until they save. It only ever touches unsaved form
 * state and is labelled as detected, so it's a visible nudge, not a silent
 * rewrite. Upgrade path if that bites: make timezone nullable server-side so
 * "unset" is representable.
 */
function withDetectedTimezone(pref: IDigestPreference): IDigestPreference {
  if (pref.timezone !== UTC) return pref;
  const detected = detectTimezone();
  return detected === UTC ? pref : { ...pref, timezone: detected };
}

function DigestForm({
  workspaceSlug,
  initial,
}: {
  workspaceSlug: string;
  initial: IDigestPreference;
}) {
  const update = useUpdateDigestPreferences(workspaceSlug);
  const [pref, setPref] = useState<IDigestPreference>(() => withDetectedTimezone(initial));

  const zones = timezoneOptions(pref.timezone);
  const viewerTime = hourInViewerTime(pref.digest_hour, pref.timezone);
  const noDays = pref.digest_weekdays.length === 0;
  // Only a nudge while it's still unsaved — once it's persisted it's just their setting.
  const detectedHint =
    initial.timezone === UTC && pref.timezone !== UTC && pref.timezone === detectTimezone()
      ? `Detected ${pref.timezone.replace(/_/g, " ")} from your browser — save to apply.`
      : null;

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (noDays) return; // backend rejects an empty set; don't round-trip a known 422
    update.mutate(pref);
  };

  const disabled = !pref.enabled;

  return (
    <form onSubmit={onSave} className="max-w-2xl px-10 py-8">
      <h1 className="text-lg font-semibold">Notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Control your daily work digest — a summary of your pending items delivered on a schedule.
      </p>

      <div className="mt-6 flex items-center justify-between rounded-lg border px-5 py-4">
        <div>
          <Label htmlFor="digest-enabled" className="text-sm font-medium">
            Daily work digest
          </Label>
          <p className="text-sm text-muted-foreground">Receive a summary of your open work.</p>
        </div>
        <Switch
          id="digest-enabled"
          checked={pref.enabled}
          onCheckedChange={(enabled) => setPref((p) => ({ ...p, enabled }))}
        />
      </div>

      <fieldset disabled={disabled} className="mt-6 space-y-6 disabled:opacity-50">
        <div className="space-y-2">
          <span className="text-sm font-medium">Delivery timing</span>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="digest-timezone" className="text-xs text-muted-foreground">
                Timezone
              </Label>
              <select
                id="digest-timezone"
                aria-label="Timezone"
                value={pref.timezone}
                onChange={(e) => setPref((p) => ({ ...p, timezone: e.target.value }))}
                className="w-64 rounded-md border bg-background px-3 py-2 text-sm"
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="digest-hour" className="text-xs text-muted-foreground">
                Time
              </Label>
              <select
                id="digest-hour"
                aria-label="Delivery hour"
                value={pref.digest_hour}
                onChange={(e) =>
                  setPref((p) => ({ ...p, digest_hour: Number(e.target.value) }))
                }
                className="rounded-md border bg-background px-3 py-2 text-sm tabular-nums"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {detectedHint ??
              (viewerTime
                ? `${formatHour(pref.digest_hour)} in ${pref.timezone.replace(/_/g, " ")} — ${viewerTime} your time.`
                : `Delivered at ${formatHour(pref.digest_hour)} in your timezone.`)}
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Days</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day, i) => {
              const on = pref.digest_weekdays.includes(i);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  aria-label={day}
                  onClick={() =>
                    setPref((p) => ({ ...p, digest_weekdays: toggle(p.digest_weekdays, i).sort() }))
                  }
                  className={cn(
                    "min-w-11 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 active:scale-[0.97]",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {day.slice(0, 3)}
                </button>
              );
            })}
          </div>
          {noDays ? (
            <p className="text-xs text-destructive">
              Pick at least one day, or turn the digest off above.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="digest-template" className="text-sm font-medium">
            Layout
          </Label>
          <select
            id="digest-template"
            aria-label="Digest layout"
            value={pref.template}
            onChange={(e) =>
              setPref((p) => ({ ...p, template: e.target.value as EDigestTemplate }))
            }
            className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm"
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.hint}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Include work items with status</span>
          <div className="flex flex-col gap-2">
            {STORY_STATUS_ORDER.map((status) => (
              <label key={status} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={pref.statuses.includes(status)}
                  onCheckedChange={() =>
                    setPref((p) => ({ ...p, statuses: toggle(p.statuses, status) }))
                  }
                />
                {STORY_STATUS_META[status as EStoryStatus].label}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Delivery channels</span>
          <div className="flex flex-col gap-2">
            {CHANNELS.map((ch) => (
              <label
                key={ch.value}
                className="flex items-center gap-2 text-sm has-[:disabled]:opacity-50"
              >
                <Checkbox
                  disabled={ch.disabled}
                  checked={pref.channels.includes(ch.value)}
                  onCheckedChange={() =>
                    setPref((p) => ({ ...p, channels: toggle(p.channels, ch.value) }))
                  }
                />
                {ch.label}
                {ch.hint ? (
                  <span className="text-xs text-muted-foreground">({ch.hint})</span>
                ) : null}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="mt-8 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={update.isPending || (pref.enabled && noDays)}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        {update.isSuccess && !update.isPending ? (
          <span className="text-sm text-muted-foreground">Saved.</span>
        ) : null}
        {update.isError ? (
          <span className="text-sm text-destructive">Couldn&apos;t save. Try again.</span>
        ) : null}
      </div>
    </form>
  );
}

export function DigestSettings({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: pref, isPending, isError, refetch } = useDigestPreferences(workspaceSlug);

  if (isPending) {
    return (
      <div className="max-w-2xl px-10 py-8">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-2 h-4 w-96" />
        <Skeleton className="mt-6 h-16 w-full" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    );
  }

  if (isError || !pref) {
    return (
      <div className="p-8">
        <EmptyState
          assetKey="error"
          title="Couldn't load preferences"
          description="Something went wrong fetching your digest settings."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  // Remount the form when the server value identity changes so its useState
  // initializer re-seeds — no setState-in-effect (react-doctor).
  return <DigestForm key={workspaceSlug} workspaceSlug={workspaceSlug} initial={pref} />;
}
