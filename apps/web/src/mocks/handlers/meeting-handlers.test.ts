import { describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import type { IMeeting, IMeetingActionItem, IMeetingTranscriptSegment } from "@/types";

const SLUG = "acme";
const PROJECT_ID = "prj_mba";

// Each tick costs two resolveMock round trips at the mock transport's simulated
// latency (~450ms) — 10 ticks comfortably covers the 2 status-advance polls plus
// the 5-line script before the meeting ends.
async function pollUntilEnded(meetingId: string, maxTicks = 10): Promise<IMeeting> {
  let meeting: IMeeting | undefined;
  for (let i = 0; i < maxTicks; i++) {
    await resolveMock(
      "GET",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${meetingId}/segments/`,
    );
    meeting = await resolveMock<IMeeting>(
      "GET",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${meetingId}/`,
    );
    if (meeting.status === "ended") return meeting;
  }
  return meeting as IMeeting;
}

describe("meeting mock handlers", () => {
  it("rejects an unsupported meeting link", async () => {
    await expect(
      resolveMock("POST", `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/`, {
        meeting_url: "https://example.com/not-a-meeting",
        consent_acknowledged: true,
      }),
    ).rejects.toThrow(/Unsupported meeting link/);
  });

  it("rejects create without consent", async () => {
    await expect(
      resolveMock("POST", `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/`, {
        meeting_url: "https://meet.google.com/abc-defg-hij",
        consent_acknowledged: false,
      }),
    ).rejects.toThrow(/[Cc]onsent/);
  });

  it("runs a meeting end to end: create, live transcript, notes, approve an action item", async () => {
    const created = await resolveMock<IMeeting>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/`,
      { meeting_url: "https://meet.google.com/abc-defg-hij", consent_acknowledged: true },
    );
    expect(created.status).toBe("joining");
    expect(created.platform).toBe("google_meet");
    expect(created.title).toBe("Google Meet meeting");

    const list = await resolveMock<IMeeting[]>(
      "GET",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/`,
    );
    expect(list.some((m) => m.id === created.id)).toBe(true);

    const ended = await pollUntilEnded(created.id);
    expect(ended.status).toBe("ended");
    expect(ended.notes_status).toBe("ready");
    expect(ended.summary).toBeTruthy();
    expect(ended.pending_action_items).toBe(2);

    const segments = await resolveMock<IMeetingTranscriptSegment[]>(
      "GET",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/segments/`,
    );
    expect(segments.length).toBeGreaterThan(0);
    expect(segments).toEqual([...segments].sort((a, b) => a.seq - b.seq));

    const items = await resolveMock<IMeetingActionItem[]>(
      "GET",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/action-items/`,
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.type).sort()).toEqual(["bug", "feature"]);
    expect(items.every((i) => i.status === "pending")).toBe(true);

    const approved = await resolveMock<IMeetingActionItem>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/action-items/${items[0].id}/approve/`,
    );
    expect(approved.status).toBe("approved");
    expect(approved.created_story_id).toBeTruthy();

    // Approving twice is refused.
    await expect(
      resolveMock(
        "POST",
        `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/action-items/${items[0].id}/approve/`,
      ),
    ).rejects.toThrow(/not pending/);
  }, 20000);

  it("stops a meeting idempotently", async () => {
    const created = await resolveMock<IMeeting>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/`,
      { meeting_url: "https://zoom.us/j/1234567890", consent_acknowledged: true },
    );
    const stopped = await resolveMock<IMeeting>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/stop/`,
    );
    expect(stopped.status).toBe("ended");

    const stoppedAgain = await resolveMock<IMeeting>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/stop/`,
    );
    expect(stoppedAgain.status).toBe("ended");
    expect(stoppedAgain.ended_at).toBe(stopped.ended_at);
  });

  it("edits, dismisses and bulk-approves action items", async () => {
    const created = await resolveMock<IMeeting>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/`,
      { meeting_url: "https://teams.live.com/meet/1234567890", consent_acknowledged: true },
    );
    await pollUntilEnded(created.id);

    const items = await resolveMock<IMeetingActionItem[]>(
      "GET",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/action-items/`,
    );

    const patched = await resolveMock<IMeetingActionItem>(
      "PATCH",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/action-items/${items[0].id}/`,
      { title: "Renamed bug", type: "task" },
    );
    expect(patched.title).toBe("Renamed bug");
    expect(patched.type).toBe("task");

    const dismissed = await resolveMock<IMeetingActionItem>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/action-items/${items[0].id}/dismiss/`,
    );
    expect(dismissed.status).toBe("dismissed");

    const bulk = await resolveMock<IMeetingActionItem[]>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/action-items/approve/`,
      { ids: items.map((i) => i.id) },
    );
    // Only the still-pending item is approved; the dismissed one is skipped.
    expect(bulk).toHaveLength(1);
    expect(bulk[0].id).toBe(items[1].id);
    expect(bulk[0].status).toBe("approved");
  }, 20000);

  it("regenerating notes replaces pending items only, keeping approved/dismissed and continuing position numbering", async () => {
    const created = await resolveMock<IMeeting>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/`,
      { meeting_url: "https://meet.google.com/abc-defg-hij", consent_acknowledged: true },
    );
    await pollUntilEnded(created.id);

    const initial = await resolveMock<IMeetingActionItem[]>(
      "GET",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/action-items/`,
    );
    expect(initial.map((i) => i.position)).toEqual([0, 1]);

    const approved = await resolveMock<IMeetingActionItem>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/action-items/${initial[0].id}/approve/`,
    );
    expect(approved.status).toBe("approved");

    const regenerated = await resolveMock<IMeeting>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/notes/`,
    );
    expect(regenerated.notes_status).toBe("ready");
    expect(regenerated.pending_action_items).toBe(2);

    const after = await resolveMock<IMeetingActionItem[]>(
      "GET",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/action-items/`,
    );
    // The approved item is kept as-is; the item that was still pending is replaced.
    expect(after.some((i) => i.id === approved.id && i.status === "approved")).toBe(true);
    expect(after.some((i) => i.id === initial[1].id)).toBe(false);

    const newlyPending = after.filter((i) => i.status === "pending");
    expect(newlyPending).toHaveLength(2);
    // New pending items are positioned after the highest existing position (1), not from 0.
    expect(newlyPending.map((i) => i.position).sort((a, b) => a - b)).toEqual([2, 3]);
  }, 20000);

  it("refuses to regenerate notes before the meeting has ended", async () => {
    const created = await resolveMock<IMeeting>(
      "POST",
      `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/`,
      { meeting_url: "https://meet.google.com/abc-defg-hij", consent_acknowledged: true },
    );
    await expect(
      resolveMock(
        "POST",
        `/workspaces/${SLUG}/projects/${PROJECT_ID}/meetings/${created.id}/notes/`,
      ),
    ).rejects.toThrow(/not ended/);
  });
});
