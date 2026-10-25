import { EMeetingStatus } from "@/types";

export const isTerminalMeetingStatus = (s: EMeetingStatus) =>
  s === EMeetingStatus.Ended || s === EMeetingStatus.Failed;
export const isLiveMeetingStatus = (s: EMeetingStatus) => !isTerminalMeetingStatus(s);

export const MEETING_STEPS = ["Joining", "Waiting for host", "Transcribing", "Ended"] as const;

/** Index into MEETING_STEPS of the step currently active (Ended ⇒ 3; Failed ⇒ step it failed at is unknown ⇒ -1). */
export function meetingStepIndex(s: EMeetingStatus): number {
  switch (s) {
    case EMeetingStatus.Requested:
    case EMeetingStatus.Joining:
      return 0;
    case EMeetingStatus.WaitingAdmission:
      return 1;
    case EMeetingStatus.InCall:
      return 2;
    case EMeetingStatus.Ended:
      return 3;
    default:
      return -1;
  }
}

export const MEETING_STATUS_META: Record<EMeetingStatus, { label: string; tone: "active" | "live" | "done" | "failed" }> = {
  [EMeetingStatus.Requested]: { label: "Starting", tone: "active" },
  [EMeetingStatus.Joining]: { label: "Joining", tone: "active" },
  [EMeetingStatus.WaitingAdmission]: { label: "Waiting for host", tone: "active" },
  [EMeetingStatus.InCall]: { label: "Transcribing", tone: "live" },
  [EMeetingStatus.Ended]: { label: "Ended", tone: "done" },
  [EMeetingStatus.Failed]: { label: "Failed", tone: "failed" },
};
