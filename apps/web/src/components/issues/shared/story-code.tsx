/** Small monospace work-item code reference (e.g. "WEB-42"). One responsibility:
 * render `code` or nothing. Unobtrusive — a reference, not a headline. */
export function StoryCode({ code }: { code: string | null | undefined }) {
  if (!code) return null;
  return <span className="font-mono text-xs text-muted-foreground">{code}</span>;
}
