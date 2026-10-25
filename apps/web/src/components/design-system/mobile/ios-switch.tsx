"use client";

import { useState } from "react";

/** UISwitch: 51×31, green when on, thumb slides on a critically-damped curve. */
export function IosSwitch({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => setOn((v) => !v)}
      className="relative h-[31px] w-[51px] shrink-0 rounded-full"
      style={{
        background: on ? "var(--ios-tint-green)" : "var(--ios-fill)",
        transition: "background-color 200ms ease-out",
      }}
    >
      <span
        className="absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)]"
        style={{
          transform: on ? "translateX(20px)" : "translateX(0)",
          transition: "transform 260ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      />
    </button>
  );
}
