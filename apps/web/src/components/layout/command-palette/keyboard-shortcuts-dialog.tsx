"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { CommandGroupKey, ICommand } from "@/lib/nav/command-registry";
import {
  CREATE_COMMANDS,
  NAVIGATE_COMMANDS,
  MISC_COMMANDS,
  PREFERENCES_COMMANDS,
  HELP_COMMANDS,
} from "@/lib/nav/command-actions";

const GROUP_LABELS: Record<CommandGroupKey, string> = {
  create: "Create",
  navigate: "Navigate",
  search: "Search",
  contextual: "Contextual",
  miscellaneous: "Miscellaneous",
  preferences: "Preferences",
  help: "Help",
};

// Display order — matches the palette's own group order.
const GROUP_ORDER: CommandGroupKey[] = [
  "create",
  "navigate",
  "miscellaneous",
  "preferences",
  "help",
];

const ALL_COMMANDS: ICommand[] = [
  ...CREATE_COMMANDS,
  ...NAVIGATE_COMMANDS,
  ...MISC_COMMANDS,
  ...PREFERENCES_COMMANDS,
  ...HELP_COMMANDS,
];

/** Renders a key sequence like "gh" or "ctrl+/" as keycaps. */
function Keycap({ sequence }: { sequence: string }) {
  const keys = sequence.includes("+") ? sequence.split("+") : sequence.split("");
  return (
    <span className="flex items-center gap-1">
      {/* `keys` is a fixed-order split of the immutable `sequence` prop — it never
          reorders or filters, so the index is a stable key here. */}
      {keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1">{/* eslint-disable-line react-doctor/no-array-index-as-key */}
          {i > 0 ? <span className="text-[10px] text-muted-foreground/70">then</span> : null}
          <kbd className="inline-flex min-w-5 justify-center rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase">
            {k}
          </kbd>
        </span>
      ))}
    </span>
  );
}

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const withShortcut = ALL_COMMANDS.filter((c) => !!c.keySequence);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription className="sr-only">
          List of available keyboard shortcuts and command chords for the command palette.
        </DialogDescription>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto pt-2">
          {GROUP_ORDER.map((group) => {
            const commands = withShortcut.filter((c) => c.group === group);
            if (commands.length === 0) return null;
            return (
              <div key={group}>
                <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  {GROUP_LABELS[group]}
                </h3>
                <ul className="space-y-1.5">
                  {commands.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-4 text-sm">
                      <span className="flex items-center gap-2">
                        <HugeiconsIcon icon={c.icon} className="size-4 text-muted-foreground" />
                        {c.label}
                      </span>
                      <Keycap sequence={c.keySequence!} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
