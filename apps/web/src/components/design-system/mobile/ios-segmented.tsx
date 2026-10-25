"use client";

import { useState } from "react";

import { ios, text } from "./ios-css";

/** UISegmentedControl: tertiary-fill track, raised thumb that slides between equal segments. */
export function IosSegmented({ options, label }: { options: string[]; label: string }) {
  const [index, setIndex] = useState(0);
  return (
    <div
      role="tablist"
      aria-label={label}
      className="relative grid h-8 rounded-[9px] p-[2px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)`, background: ios("fill-tertiary") }}
    >
      <span
        aria-hidden
        className="absolute top-[2px] bottom-[2px] left-[2px] rounded-[7px] shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)]"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
          background: ios("thumb"),
          transition: "transform 260ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      />
      {options.map((o, i) => (
        <button
          key={o}
          type="button"
          role="tab"
          aria-selected={i === index}
          onClick={() => setIndex(i)}
          className="relative z-10"
          style={{ ...text("subheadline"), fontWeight: i === index ? 600 : 500, color: ios("label") }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
