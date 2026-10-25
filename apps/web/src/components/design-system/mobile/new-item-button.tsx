import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { ios, text } from "./ios-css";

/** Reminders' bottom-left "⊕ New Reminder" — creation lives where the list is. */
export function NewItemButton({ label = "New Item" }: { label?: string }) {
  return (
    <button type="button" className="flex items-center gap-1.5 active:opacity-60" style={{ ...text("headline"), color: ios("tint") }}>
      <HugeiconsIcon icon={PlusSignIcon} size={22} color="currentColor" strokeWidth={2.6} />
      {label}
    </button>
  );
}
