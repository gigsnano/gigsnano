"use client";

import { type ReactNode, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Video01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateMeeting } from "@/hooks/meetings/use-meetings";
import { detectMeetingPlatform } from "@/lib/meetings/meeting-link";
import { cn } from "@/lib/utils";
import { APIError } from "@/services/api-error";

import { PLATFORM_LABEL, PlatformIcon } from "./platform-icon";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const detectionLayer =
  "absolute inset-0 flex items-center gap-1.5 transition-opacity duration-150 ease-in-out motion-reduce:transition-none";

/**
 * Dialog that sends "GigsNano Notetaker" into a call. Uncontrolled by default
 * (renders its own trigger), or pass `open`/`onOpenChange` to drive it externally
 * (e.g. from an EmptyState CTA).
 */
export function SendNotetakerDialog({
  workspaceSlug,
  projectId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
}: {
  workspaceSlug: string;
  projectId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const router = useRouter();
  const create = useCreateMeeting(workspaceSlug, projectId);

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setUncontrolledOpen;

  const [meetingUrl, setMeetingUrl] = useState("");
  const [title, setTitle] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const urlFieldId = useId();
  const titleFieldId = useId();
  const consentId = useId();

  const trimmedUrl = meetingUrl.trim();
  const detected = detectMeetingPlatform(trimmedUrl);
  const canSubmit = Boolean(detected) && consent && !create.isPending;

  const reset = () => {
    setMeetingUrl("");
    setTitle("");
    setConsent(false);
    setSubmitError(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Re-entry guard: `canSubmit` already disables the button while pending, but a
    // fast double Enter can fire this handler again before the disabled state re-renders.
    if (!canSubmit || create.isPending) return;
    setSubmitError(null);
    try {
      const meeting = await create.mutateAsync({
        meeting_url: trimmedUrl,
        ...(title.trim() ? { title: title.trim() } : {}),
        consent_acknowledged: true,
      });
      reset();
      setOpen(false);
      router.push(`/${workspaceSlug}/projects/${projectId}/meetings/${meeting.id}`);
    } catch (err) {
      setSubmitError(
        err instanceof APIError ? err.message : "Couldn't send the notetaker. Try again.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {isControlled ? null : (
        <DialogTrigger asChild>
          {children ?? (
            <Button size="sm" className="active:scale-[0.97]">
              <HugeiconsIcon icon={Video01Icon} />
              Send notetaker
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">Send notetaker</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          GigsNano Notetaker joins as a participant. The host needs to admit it.
        </DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={urlFieldId}>Meeting link</Label>
            <input
              id={urlFieldId}
              type="url"
              autoFocus
              aria-label="Meeting link"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              className={field}
              required
            />
            {/* Fixed-height (h-5) so none of the three states shift the layout below. */}
            <div className="relative h-5 text-xs">
              <p
                aria-hidden={trimmedUrl !== ""}
                className={cn(
                  detectionLayer,
                  "text-muted-foreground",
                  trimmedUrl === "" ? "opacity-100" : "opacity-0",
                )}
              >
                Paste a Google Meet, Microsoft Teams or Zoom link
              </p>
              <p
                aria-hidden={!detected}
                className={cn(
                  detectionLayer,
                  "font-medium text-foreground",
                  detected ? "opacity-100" : "opacity-0",
                )}
              >
                {detected ? (
                  <>
                    <PlatformIcon platform={detected} className="size-4 bg-transparent" />
                    {PLATFORM_LABEL[detected]} detected
                  </>
                ) : null}
              </p>
              <p
                aria-hidden={!(trimmedUrl !== "" && !detected)}
                className={cn(
                  detectionLayer,
                  "text-destructive",
                  trimmedUrl !== "" && !detected ? "opacity-100" : "opacity-0",
                )}
              >
                This link isn&apos;t a supported meeting link
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={titleFieldId}>Title</Label>
            <input
              id={titleFieldId}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={detected ? `${PLATFORM_LABEL[detected]} meeting` : "Meeting title"}
              className={field}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={consentId}
              checked={consent}
              onCheckedChange={(value) => setConsent(value === true)}
            />
            <Label htmlFor={consentId} className="text-sm font-normal text-muted-foreground">
              I&apos;ll let participants know this meeting is being transcribed.
            </Label>
          </div>
          {submitError ? (
            <p role="alert" className="text-xs text-destructive">
              {submitError}
            </p>
          ) : null}
          <Button type="submit" disabled={!canSubmit} className="active:scale-[0.97]">
            {create.isPending ? "Sending…" : "Send notetaker"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
