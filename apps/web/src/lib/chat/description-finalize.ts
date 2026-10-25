import type { IThreadMessage } from "@/types";

export type TFinalizedDescription = { title?: string; markdown: string; html: string };

const MOCK_NOTE =
  "_Drafted from the conversation by the connected agent (mock). Set up the backend finalize-description endpoint for real distillation._";

/** Escape text for safe embedding in the mock HTML output. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Split an assistant/user turn into short, essential bullet lines. */
function toBullets(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 6);
}

/**
 * Deterministic MOCK distillation. The real model does this on the backend;
 * here we produce a clean, essential description from the USER intent + the
 * latest substantive ASSISTANT turn — explicitly NOT the raw transcript.
 * The "distill, don't transcribe" rule lives here and nowhere else.
 */
export function distillDescription(
  messages: IThreadMessage[],
  agentName: string,
): TFinalizedDescription {
  const userTurns = messages.filter((m) => m.role === "user" && m.content.trim());
  const assistantTurns = messages.filter((m) => m.role === "assistant" && m.content.trim());

  const intent = userTurns.map((m) => m.content.trim()).join(" ");
  const lastAssistant = assistantTurns.at(-1)?.content ?? "";

  const bullets = [...toBullets(intent), ...toBullets(lastAssistant)]
    .filter((b, i, arr) => arr.indexOf(b) === i) // de-dupe
    .slice(0, 8);

  const bulletMd = bullets.length
    ? bullets.map((b) => `- ${b}`).join("\n")
    : "- Summary will appear here once the conversation has content.";

  const markdown = `## Summary\n\n${bulletMd}\n\n${MOCK_NOTE}`;

  const bulletHtml = bullets.length
    ? `<ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
    : `<ul><li>Summary will appear here once the conversation has content.</li></ul>`;
  const html = `<h2>Summary</h2>${bulletHtml}<p><em>Drafted by ${esc(agentName)} (mock).</em></p>`;

  return { markdown, html };
}

/** True when stripping tags/entities leaves non-whitespace text. */
export function htmlHasContent(html: string): boolean {
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return text.length > 0;
}
