import { formatLlmUsageSource } from "./format-source";

interface ILlmUsageFilterChipsProps {
  selectedDate?: string | null;
  workspace?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
  source?: string;
  onClearDate: () => void;
  onClearWorkspace: () => void;
  onClearUser: () => void;
  onClearSource: () => void;
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
    >
      <span>{label}</span>
      <span aria-hidden>×</span>
    </button>
  );
}

export function LlmUsageFilterChips({
  selectedDate,
  workspace,
  user,
  source,
  onClearDate,
  onClearWorkspace,
  onClearUser,
  onClearSource,
}: ILlmUsageFilterChipsProps) {
  const hasAny = Boolean(selectedDate || workspace || user || source);
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selectedDate ? <Chip label={selectedDate} onRemove={onClearDate} /> : null}
      {workspace ? <Chip label={workspace.name} onRemove={onClearWorkspace} /> : null}
      {user ? <Chip label={user.name} onRemove={onClearUser} /> : null}
      {source ? <Chip label={formatLlmUsageSource(source)} onRemove={onClearSource} /> : null}
    </div>
  );
}
