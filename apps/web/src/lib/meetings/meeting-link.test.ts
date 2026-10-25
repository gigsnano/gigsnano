import { describe, expect, it } from "vitest";

import { EMeetingPlatform } from "@/types";

import { detectMeetingPlatform } from "./meeting-link";

describe("detectMeetingPlatform", () => {
  it.each([
    ["https://meet.google.com/abc-defg-hij", EMeetingPlatform.GoogleMeet],
    ["meet.google.com/abc-defg-hij", EMeetingPlatform.GoogleMeet],
    ["http://meet.google.com/abc-defg-hij?authuser=0", EMeetingPlatform.GoogleMeet],
    ["https://teams.live.com/meet/1234567890", EMeetingPlatform.Teams],
    ["https://teams.live.com/meet/1234567890?p=abcXYZ", EMeetingPlatform.Teams],
    [
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_xyz%40thread.v2/0",
      EMeetingPlatform.Teams,
    ],
    ["https://zoom.us/j/1234567890", EMeetingPlatform.Zoom],
    ["https://us02web.zoom.us/j/1234567890?pwd=abc123", EMeetingPlatform.Zoom],
    ["https://zoom.us/wc/1234567890/join", EMeetingPlatform.Zoom],
  ])("detects %s as %s", (url, expected) => {
    expect(detectMeetingPlatform(url)).toBe(expected);
  });

  it.each([
    ["https://example.com/meeting", null],
    ["not a url at all", null],
    ["https://meet.google.com/abcdefg", null],
    ["https://meet.google.com/", null],
    ["https://teams.microsoft.com/some-other-path", null],
    ["https://zoom.us/", null],
    ["https://notzoom.us/j/1234567890", null],
    ["", null],
  ])("rejects %s", (url, expected) => {
    expect(detectMeetingPlatform(url)).toBe(expected);
  });
});
