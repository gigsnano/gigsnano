import { describe, expect, it } from "vitest";

import { EMeetingStatus } from "@/types";

import {
  MEETING_STATUS_META,
  MEETING_STEPS,
  isLiveMeetingStatus,
  isTerminalMeetingStatus,
  meetingStepIndex,
} from "./meeting-status";

describe("isTerminalMeetingStatus / isLiveMeetingStatus", () => {
  it("is terminal only for ended/failed", () => {
    expect(isTerminalMeetingStatus(EMeetingStatus.Ended)).toBe(true);
    expect(isTerminalMeetingStatus(EMeetingStatus.Failed)).toBe(true);
    expect(isTerminalMeetingStatus(EMeetingStatus.Requested)).toBe(false);
    expect(isTerminalMeetingStatus(EMeetingStatus.Joining)).toBe(false);
    expect(isTerminalMeetingStatus(EMeetingStatus.WaitingAdmission)).toBe(false);
    expect(isTerminalMeetingStatus(EMeetingStatus.InCall)).toBe(false);
  });

  it("is live exactly when not terminal", () => {
    for (const status of Object.values(EMeetingStatus)) {
      expect(isLiveMeetingStatus(status)).toBe(!isTerminalMeetingStatus(status));
    }
  });
});

describe("meetingStepIndex", () => {
  it("maps each status to its stepper index", () => {
    expect(meetingStepIndex(EMeetingStatus.Requested)).toBe(0);
    expect(meetingStepIndex(EMeetingStatus.Joining)).toBe(0);
    expect(meetingStepIndex(EMeetingStatus.WaitingAdmission)).toBe(1);
    expect(meetingStepIndex(EMeetingStatus.InCall)).toBe(2);
    expect(meetingStepIndex(EMeetingStatus.Ended)).toBe(3);
    expect(meetingStepIndex(EMeetingStatus.Failed)).toBe(-1);
  });

  it("has a step label for every non-failed index", () => {
    expect(MEETING_STEPS).toEqual(["Joining", "Waiting for host", "Transcribing", "Ended"]);
  });
});

describe("MEETING_STATUS_META", () => {
  it("has an entry for every status", () => {
    for (const status of Object.values(EMeetingStatus)) {
      expect(MEETING_STATUS_META[status]).toBeDefined();
      expect(MEETING_STATUS_META[status].label).toBeTruthy();
    }
  });

  it("tones the live call as live and ended as done", () => {
    expect(MEETING_STATUS_META[EMeetingStatus.InCall].tone).toBe("live");
    expect(MEETING_STATUS_META[EMeetingStatus.Ended].tone).toBe("done");
    expect(MEETING_STATUS_META[EMeetingStatus.Failed].tone).toBe("failed");
  });
});
