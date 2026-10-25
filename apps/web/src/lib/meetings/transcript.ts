import type { IMeetingTranscriptSegment } from "@/types";

/** `mm:ss` under an hour, `h:mm:ss` from an hour on. */
export function formatOffset(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export interface IMeetingSpeakerGroup {
  key: string;
  speaker: string;
  start_ms: number;
  segments: IMeetingTranscriptSegment[];
}

/** Merges consecutive segments from the same speaker into one row (null speaker ⇒ "Speaker"). */
export function groupBySpeaker(segments: IMeetingTranscriptSegment[]): IMeetingSpeakerGroup[] {
  const groups: IMeetingSpeakerGroup[] = [];

  for (const segment of segments) {
    const speaker = segment.speaker ?? "Speaker";
    const current = groups.at(-1);
    if (current && current.speaker === speaker) {
      current.segments.push(segment);
      continue;
    }
    groups.push({
      key: String(segment.seq),
      speaker,
      start_ms: segment.start_ms,
      segments: [segment],
    });
  }

  return groups;
}
