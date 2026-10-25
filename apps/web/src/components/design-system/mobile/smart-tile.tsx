import type { IconSvgElement } from "@hugeicons/react";

import { IconCircle } from "./icon-circle";
import { ios, PRESSABLE, text } from "./ios-css";

interface ISmartTileProps {
  icon: IconSvgElement;
  color: string;
  label: string;
  count: number;
  /** Full-width tile (odd count in the grid). */
  wide?: boolean;
}

/** Reminders smart-list tile: badge + big rounded count, label underneath. */
export function SmartTile({ icon, color, label, count, wide }: ISmartTileProps) {
  return (
    <button
      type="button"
      aria-label={`${label}, ${count}`}
      className={`${PRESSABLE} flex flex-col gap-1.5 rounded-xl px-3 pt-2.5 pb-2 text-left ${wide ? "col-span-2" : ""}`}
      style={{ background: ios("surface") }}
    >
      <span className="flex items-start justify-between">
        <IconCircle icon={icon} color={color} size={30} />
        <span style={{ ...text("count"), color: ios("label") }} className="tabular-nums">
          {count}
        </span>
      </span>
      <span style={{ ...text("headline"), fontSize: 16, color: ios("label-secondary") }}>{label}</span>
    </button>
  );
}
