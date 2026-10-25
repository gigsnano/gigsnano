import { detectMeetingPlatform } from "@/lib/meetings/meeting-link";
import { APIError } from "@/services/api-error";
import type { IMeeting, IMeetingActionItem, IMeetingTranscriptSegment } from "@/types";
import { EMeetingPlatform, EMeetingStatus } from "@/types";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown, query: URLSearchParams) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);

const notFound = (what: string): never => {
  throw new APIError(404, `${what} not found`);
};

interface IMockMeeting extends IMeeting {
  workspace_slug: string;
  script_index: number;
}

const PLATFORM_LABEL: Record<EMeetingPlatform, string> = {
  [EMeetingPlatform.GoogleMeet]: "Google Meet",
  [EMeetingPlatform.Teams]: "Teams",
  [EMeetingPlatform.Zoom]: "Zoom",
};

/**
 * Five scripted transcript lines, appended one per `GET .../segments/` poll
 * while the meeting is `in_call`. Copied verbatim from the backend's
 * `FAKE_SCRIPT` (`apps/api/src/gigsnano_api/meetings/provider.py`) so the
 * two mock tools stay interchangeable. Line 1 names a bug (payment timeout),
 * line 2 a feature (saved cards) — the two pending action items below quote
 * those lines directly.
 */
const FAKE_SCRIPT: { speaker: string; text: string }[] = [
  { speaker: "Ada", text: "Thanks for joining. Let's review the checkout redesign." },
  {
    speaker: "Alan",
    text: "The payment timeout is still failing for some cards. I'll fix that bug by Friday.",
  },
  { speaker: "Ada", text: "We also need saved cards as a feature before launch." },
  { speaker: "Alan", text: "Agreed. I'll write the spec for saved cards next week." },
  { speaker: "Ada", text: "Great. Let's wrap up there." },
];

const meetings: IMockMeeting[] = [];
const segmentsByMeeting = new Map<string, IMeetingTranscriptSegment[]>();
const itemsByMeeting = new Map<string, IMeetingActionItem[]>();

let meetingSeq = 0;
let itemSeq = 0;

function out(m: IMockMeeting): IMeeting {
  const { workspace_slug: _slug, script_index: _scriptIndex, ...wire } = m;
  void _slug;
  void _scriptIndex;
  return wire;
}

function findMeeting(slug: string, projectId: string, meetingId: string): IMockMeeting {
  const m = meetings.find(
    (x) => x.workspace_slug === slug && x.project_id === projectId && x.id === meetingId,
  );
  return m ?? notFound("Meeting");
}

function findItem(meetingId: string, itemId: string): IMeetingActionItem {
  const item = (itemsByMeeting.get(meetingId) ?? []).find((i) => i.id === itemId);
  return item ?? notFound("Action item");
}

/** Advances joining → waiting_admission → in_call on each meeting-detail poll. */
function advanceStatus(m: IMockMeeting) {
  if (m.status === EMeetingStatus.Joining) {
    m.status = EMeetingStatus.WaitingAdmission;
  } else if (m.status === EMeetingStatus.WaitingAdmission) {
    m.status = EMeetingStatus.InCall;
    m.started_at = new Date().toISOString();
  }
}

/**
 * Ends the meeting (if not already) and (re)generates its pending action
 * items. Per the spec, regenerating notes replaces PENDING items only —
 * approved/dismissed items are kept, and the new pending items are positioned
 * after the highest existing position so they sort after any kept items.
 */
function finishMeeting(m: IMockMeeting) {
  m.status = EMeetingStatus.Ended;
  m.ended_at ??= new Date().toISOString();
  m.notes_status = "ready";
  m.summary =
    "Covered a payment timeout affecting some cards and a request to add saved cards before launch.";

  const existing = itemsByMeeting.get(m.id) ?? [];
  const kept = existing.filter((i) => i.status !== "pending");
  const basePosition = existing.length > 0 ? Math.max(...existing.map((i) => i.position)) + 1 : 0;

  const created: IMeetingActionItem[] = [
    {
      id: `mai_${++itemSeq}`,
      meeting_id: m.id,
      status: "pending",
      type: "bug",
      title: "Fix payment timeout for some cards",
      description: "The payment timeout is still failing for some cards during checkout.",
      quote: FAKE_SCRIPT[1].text,
      speaker_name: FAKE_SCRIPT[1].speaker,
      assignee_id: null,
      target_date: null,
      created_story_id: null,
      position: basePosition,
    },
    {
      id: `mai_${++itemSeq}`,
      meeting_id: m.id,
      status: "pending",
      type: "feature",
      title: "Add saved cards",
      description: "Add saved cards as a feature before launch.",
      quote: FAKE_SCRIPT[2].text,
      speaker_name: FAKE_SCRIPT[2].speaker,
      assignee_id: null,
      target_date: null,
      created_story_id: null,
      position: basePosition + 1,
    },
  ];
  itemsByMeeting.set(m.id, [...kept, ...created]);
  m.pending_action_items = created.length;
}

export function makeMeetingHandlers(): Handler[] {
  return [
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/$/,
      resolve: ([, slug, projectId], body) => {
        const b = (body ?? {}) as {
          meeting_url?: string;
          title?: string;
          consent_acknowledged?: boolean;
        };
        if (!b.consent_acknowledged) throw new APIError(422, "Consent is required");
        const platform = b.meeting_url ? detectMeetingPlatform(b.meeting_url) : null;
        if (!platform) throw new APIError(422, "Unsupported meeting link");

        const now = new Date().toISOString();
        const created: IMockMeeting = {
          id: `mtg_${++meetingSeq}`,
          workspace_slug: slug,
          project_id: projectId,
          title: b.title?.trim() || `${PLATFORM_LABEL[platform]} meeting`,
          platform,
          meeting_url: b.meeting_url as string,
          status: EMeetingStatus.Joining,
          failure_reason: null,
          started_at: null,
          ended_at: null,
          created_at: now,
          created_by_id: null,
          summary: null,
          notes_status: null,
          pending_action_items: 0,
          script_index: 0,
        };
        meetings.push(created);
        segmentsByMeeting.set(created.id, []);
        itemsByMeeting.set(created.id, []);
        return clone(out(created));
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/$/,
      resolve: ([, slug, projectId]) =>
        clone(
          meetings
            .filter((m) => m.workspace_slug === slug && m.project_id === projectId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map(out),
        ),
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/([^/]+)\/$/,
      resolve: ([, slug, projectId, meetingId]) => {
        const m = findMeeting(slug, projectId, meetingId);
        advanceStatus(m);
        return clone(out(m));
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/([^/]+)\/segments\/$/,
      resolve: ([, slug, projectId, meetingId]) => {
        const m = findMeeting(slug, projectId, meetingId);
        const list = segmentsByMeeting.get(m.id) ?? [];
        if (m.status === EMeetingStatus.InCall && m.script_index < FAKE_SCRIPT.length) {
          const line = FAKE_SCRIPT[m.script_index];
          const startMs = m.script_index * 4000;
          list.push({
            seq: m.script_index,
            speaker: line.speaker,
            text: line.text,
            start_ms: startMs,
            end_ms: startMs + 3500,
          });
          m.script_index += 1;
          segmentsByMeeting.set(m.id, list);
          if (m.script_index >= FAKE_SCRIPT.length) finishMeeting(m);
        }
        return clone([...list].sort((a, b) => a.seq - b.seq));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/([^/]+)\/stop\/$/,
      resolve: ([, slug, projectId, meetingId]) => {
        const m = findMeeting(slug, projectId, meetingId);
        if (m.status !== EMeetingStatus.Ended && m.status !== EMeetingStatus.Failed) {
          m.status = EMeetingStatus.Ended;
          m.ended_at = new Date().toISOString();
          m.notes_status = "empty";
        }
        return clone(out(m));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/([^/]+)\/notes\/$/,
      resolve: ([, slug, projectId, meetingId]) => {
        const m = findMeeting(slug, projectId, meetingId);
        if (m.status !== EMeetingStatus.Ended) throw new APIError(409, "Meeting has not ended yet");
        finishMeeting(m);
        return clone(out(m));
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/([^/]+)\/action-items\/$/,
      resolve: ([, slug, projectId, meetingId]) => {
        findMeeting(slug, projectId, meetingId);
        return clone(
          [...(itemsByMeeting.get(meetingId) ?? [])].sort((a, b) => a.position - b.position),
        );
      },
    },
    {
      method: "PATCH",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/([^/]+)\/action-items\/([^/]+)\/$/,
      resolve: ([, slug, projectId, meetingId, itemId], body) => {
        findMeeting(slug, projectId, meetingId);
        const item = findItem(meetingId, itemId);
        if (item.status !== "pending") throw new APIError(409, "Action item is not pending");
        const b = (body ?? {}) as Partial<IMeetingActionItem>;
        if (b.title !== undefined) item.title = b.title;
        if (b.description !== undefined) item.description = b.description;
        if (b.type !== undefined) item.type = b.type;
        if (b.assignee_id !== undefined) item.assignee_id = b.assignee_id;
        if (b.target_date !== undefined) item.target_date = b.target_date;
        return clone(item);
      },
    },
    {
      method: "POST",
      pattern:
        /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/([^/]+)\/action-items\/([^/]+)\/approve\/$/,
      resolve: ([, slug, projectId, meetingId, itemId]) => {
        const m = findMeeting(slug, projectId, meetingId);
        const item = findItem(meetingId, itemId);
        if (item.status !== "pending") throw new APIError(409, "Action item is not pending");
        item.status = "approved";
        item.created_story_id = `story_mock_${++itemSeq}`;
        m.pending_action_items = Math.max(0, m.pending_action_items - 1);
        return clone(item);
      },
    },
    {
      method: "POST",
      pattern:
        /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/([^/]+)\/action-items\/([^/]+)\/dismiss\/$/,
      resolve: ([, slug, projectId, meetingId, itemId]) => {
        const m = findMeeting(slug, projectId, meetingId);
        const item = findItem(meetingId, itemId);
        if (item.status !== "pending") throw new APIError(409, "Action item is not pending");
        item.status = "dismissed";
        m.pending_action_items = Math.max(0, m.pending_action_items - 1);
        return clone(item);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/projects\/([^/]+)\/meetings\/([^/]+)\/action-items\/approve\/$/,
      resolve: ([, slug, projectId, meetingId], body) => {
        const m = findMeeting(slug, projectId, meetingId);
        const b = (body ?? {}) as { ids?: string[] };
        const list = itemsByMeeting.get(meetingId) ?? [];
        const approved: IMeetingActionItem[] = [];
        for (const id of b.ids ?? []) {
          const item = list.find((i) => i.id === id);
          if (!item || item.status !== "pending") continue;
          item.status = "approved";
          item.created_story_id = `story_mock_${++itemSeq}`;
          m.pending_action_items = Math.max(0, m.pending_action_items - 1);
          approved.push(item);
        }
        return clone(approved);
      },
    },
  ];
}
