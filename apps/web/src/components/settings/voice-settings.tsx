"use client";

/**
 * Workspace voice configuration (GIN-516).
 *
 * Only the fields that a workspace admin can actually change today are shown.
 * The provider block (region, deployment, locales, key) is hidden until the
 * voice-policy endpoint lands — the API takes those from server env, so a form
 * for them would claim a control the admin does not have. See git history for
 * the markup, including the write-only secret field: a key is entered once and
 * never rendered again, not even masked, because `sk_live_••••1234` still leaks
 * the last four to anyone shoulder-surfing an admin.
 *
 * **Publishing is a separate act from editing.** Draft changes do nothing until
 * published, and publishing shows consequences first. A voice policy that
 * silently took effect mid-session would change the rules under a user who is
 * halfway through confirming a write.
 */

import { useState } from "react";
import { Alert01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { validatePolicy, type IVoicePolicyDraft } from "@/lib/voice/policy-validation";

interface VoiceSettingsProps {
  initial: IVoicePolicyDraft;
  publishedVersion: number;
  // Optional: a server component can't hand a function to a client component,
  // so the screen has to work with no handlers wired at all.
  onPublish?: (draft: IVoicePolicyDraft) => void;
  onRollback?: () => void;
}

export function VoiceSettings({
  initial,
  publishedVersion,
  onPublish,
  onRollback,
}: VoiceSettingsProps) {
  const [draft, setDraft] = useState<IVoicePolicyDraft>(initial);
  const problems = validatePolicy(draft);
  const set =<K extends keyof IVoicePolicyDraft>(key: K, value: IVoicePolicyDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="gn-voice-enabled">Voice input</Label>
            <p className="text-sm text-muted-foreground">
              Off by default. Text chat is unaffected either way.
            </p>
          </div>
          <Switch
            id="gn-voice-enabled"
            checked={draft.enabled}
            onCheckedChange={(v) => set("enabled", v)}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Safety and privacy</h3>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="gn-voice-confirm">Confirm material writes</Label>
            <p className="text-sm text-muted-foreground">
              Required by platform policy — a workspace can be stricter, never looser.
            </p>
          </div>
          <Switch id="gn-voice-confirm" checked={draft.requireConfirmation} disabled />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="gn-voice-audio">Keep raw audio</Label>
            <p className="text-sm text-muted-foreground">
              Off by default. Only enable for a time-boxed diagnostic investigation.
            </p>
          </div>
          <Switch
            id="gn-voice-audio"
            checked={draft.retainRawAudio}
            onCheckedChange={(v) => set("retainRawAudio", v)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gn-voice-retention">Transcript retention (days)</Label>
          <Input
            id="gn-voice-retention"
            type="number"
            min={0}
            max={365}
            value={draft.transcriptRetentionDays}
            onChange={(e) => set("transcriptRetentionDays", Number(e.target.value))}
          />
          {/* The effective behaviour in a sentence, because a number alone does
              not tell an admin what actually happens to their people's words. */}
          <p className="text-sm text-muted-foreground">
            Transcripts are deleted after {draft.transcriptRetentionDays} days.
            {draft.retainRawAudio ? " Raw audio is kept for the same period." : " Audio is never stored."}{" "}
            Records of work items created by voice are kept regardless, as change history.
          </p>
        </div>
      </section>

      {problems.length ? (
        <ul role="alert" className="space-y-1 rounded-lg border border-destructive/40 p-3">
          {problems.map((problem) => (
            <li key={problem} className="flex items-start gap-2 text-sm text-destructive">
              <HugeiconsIcon icon={Alert01Icon} className="mt-0.5 size-4 shrink-0" />
              {problem}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={problems.length > 0 || !onPublish}
          onClick={() => onPublish?.(draft)}
        >
          Publish
        </Button>
        <Button type="button" variant="ghost" disabled={!onRollback} onClick={onRollback}>
          Roll back to v{Math.max(1, publishedVersion - 1)}
        </Button>
        <p className="text-sm text-muted-foreground">
          Live sessions keep the version they started on.
        </p>
      </div>
    </div>
  );
}
