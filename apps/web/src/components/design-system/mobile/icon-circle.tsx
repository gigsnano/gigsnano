import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

/** Filled tint circle + white glyph — Reminders' list / smart-list badge. */
export function IconCircle({ icon, color, size = 28 }: { icon: IconSvgElement; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: color }}
    >
      <HugeiconsIcon icon={icon} size={Math.round(size * 0.56)} color="#fff" strokeWidth={2.2} />
    </span>
  );
}
