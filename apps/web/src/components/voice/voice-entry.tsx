"use client";

/**
 * Voice entry, microphone permission and device preflight (GIN-503).
 *
 * The explainer dialog exists because the browser's own prompt says nothing
 * useful — "gigsnano.com wants to use your microphone" gives a user no basis to
 * decide. We say what is captured, where it goes and what is kept *before*
 * triggering it, so the browser prompt is a confirmation rather than a surprise.
 *
 * No audio leaves the device until the user presses Start: `getUserMedia` is
 * called for the level preflight, but the stream stays local and is torn down
 * when the dialog closes.
 */

import { useEffect, useRef, useState } from "react";
import { Mic01Icon, MicOff01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EMicPermission } from "@/types/voice";

interface VoiceEntryProps {
  workspaceName: string;
  projectName?: string;
  /** False when the workspace has not enabled voice (GIN-517 policy). */
  enabled?: boolean;
  /** Why it is off, straight from the server. "Greyed out with no explanation"
   *  is the support ticket this exists to prevent. */
  disabledReason?: string;
  onStart: (deviceId: string) => void;
  className?: string;
}

function detectSupport(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window !== "undefined" &&
    typeof window.AudioContext !== "undefined"
  );
}

export function VoiceEntry({
  workspaceName,
  projectName,
  enabled = true,
  disabledReason,
  onStart,
  className,
}: VoiceEntryProps) {
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<EMicPermission>(EMicPermission.Unknown);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  // React Compiler memoises these; hand-written useCallback is a project-wide
  // rule violation and buys nothing (CLAUDE.md).
  const teardown = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioRef.current?.close();
    audioRef.current = null;
    setLevel(0);
  };

  // Teardown on unmount is not optional: a live MediaStream keeps the browser's
  // recording indicator lit, which reads as the app listening when it is not.
  // Reads the refs directly rather than depending on `teardown`, which is rebuilt
  // every render and would re-run this effect (and kill the stream) each time.
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioRef.current?.close();
    },
    [],
  );

  const requestMic = async () => {
    if (!detectSupport()) {
      setPermission(EMicPermission.Unsupported);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermission(EMicPermission.Granted);

      const found = await navigator.mediaDevices.enumerateDevices();
      const inputs = found.filter((d) => d.kind === "audioinput");
      setDevices(inputs);
      setDeviceId((current) => current || inputs[0]?.deviceId || "");

      const context = new AudioContext();
      audioRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const bins = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(bins);
        const average = bins.reduce((sum, v) => sum + v, 0) / bins.length;
        setLevel(Math.min(1, average / 96));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setPermission(EMicPermission.Denied);
    }
  };

  const close = () => {
    setOpen(false);
    teardown();
  };

  const start = () => {
    onStart(deviceId);
    close();
  };

  const label = enabled
    ? "Start voice input"
    : disabledReason || "Voice is off for this workspace";

  return (
    <>
      {/* Own provider, matching usage-breakdown and story-panel. Radix throws
          rather than degrading when the context is missing, so a component that
          can be mounted anywhere has to carry its own. */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            disabled={!enabled}
            onClick={() => setOpen(true)}
            className={cn("gn-voice-entry", className)}
          >
            <HugeiconsIcon icon={enabled ? Mic01Icon : MicOff01Icon} className="size-4" />
          </Button>
        </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Talk to GigsAI</DialogTitle>
            <DialogDescription>
              Your voice is transcribed so the assistant can read and draft work items. Nothing is
              recorded — audio is not stored, and the transcript follows your workspace&rsquo;s
              retention policy.
            </DialogDescription>
          </DialogHeader>

          {/* Scope is shown before the session starts, so nobody dictates a bug
              into the wrong project and finds out afterwards. */}
          <dl className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="font-medium">{workspaceName}</dd>
            </div>
            {projectName ? (
              <div className="mt-1 flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Project</dt>
                <dd className="font-medium">{projectName}</dd>
              </div>
            ) : null}
          </dl>

          {permission === EMicPermission.Unsupported ? (
            <p role="alert" className="text-sm text-muted-foreground">
              This browser doesn&rsquo;t support microphone capture. Chrome, Edge and Safari 16+ do
              — or keep using text chat, which works everywhere.
            </p>
          ) : null}

          {permission === EMicPermission.Denied ? (
            /* Denial is a dead end in the browser UI, so the recovery path has
               to be spelled out. Text chat is never blocked by it. */
            <p role="alert" className="text-sm text-muted-foreground">
              Microphone access was blocked. Open the padlock in your browser&rsquo;s address bar,
              set Microphone to Allow, then reopen this dialog. Text chat still works in the
              meantime.
            </p>
          ) : null}

          {permission === EMicPermission.Granted ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="gn-voice-device" className="text-sm font-medium">
                  Microphone
                </label>
                <select
                  id="gn-voice-device"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {devices.map((device, index) => (
                    <option key={device.deviceId || device.label} value={device.deviceId}>
                      {device.label || `Microphone ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-medium">Input level</span>
                {/* A meter, not a number: the only question is "does it move
                    when I talk", and a bar answers that without being read. */}
                {/* <meter> is the semantic element for a scalar reading within a
                    known range, so assistive tech announces it without an ARIA
                    role. The bar below is the visual; the meter carries meaning. */}
                <meter
                  aria-label="Microphone input level"
                  value={Math.round(level * 100)}
                  min={0}
                  max={100}
                  className="sr-only"
                />
                <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="gn-voice-level h-full rounded-full bg-primary"
                    style={{ transform: `scaleX(${Math.max(0.02, level)})` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Say something to check the level.</p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            {permission === EMicPermission.Granted ? (
              <Button type="button" onClick={start}>
                Start listening
              </Button>
            ) : (
              <Button
                type="button"
                onClick={requestMic}
                disabled={permission === EMicPermission.Unsupported}
              >
                <HugeiconsIcon icon={Settings01Icon} className="size-4" />
                Allow microphone
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
