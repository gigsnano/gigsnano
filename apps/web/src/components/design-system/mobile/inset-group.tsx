import type { ReactNode } from "react";

import { ios, text } from "./ios-css";

interface IInsetGroupProps {
  /** Section title. "large" = Reminders' bold "My Lists"; "small" = footnote caps-free label. */
  title?: string;
  titleSize?: "large" | "small";
  trailing?: ReactNode;
  footer?: string;
  children: ReactNode;
}

/** Grouped-inset card: rounded surface floating on the grouped background. */
export function InsetGroup({ title, titleSize = "small", trailing, footer, children }: IInsetGroupProps) {
  return (
    <section className="flex flex-col">
      {title ? (
        <div className={`flex items-baseline justify-between ${titleSize === "large" ? "px-1 pb-2" : "px-4 pb-1.5"}`}>
          <h3
            style={{
              ...text(titleSize === "large" ? "title2" : "footnote"),
              color: titleSize === "large" ? ios("label") : ios("label-secondary"),
            }}
          >
            {title}
          </h3>
          {trailing}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl" style={{ background: ios("surface") }}>
        {children}
      </div>
      {footer ? (
        <p className="px-4 pt-1.5" style={{ ...text("footnote"), color: ios("label-secondary") }}>
          {footer}
        </p>
      ) : null}
    </section>
  );
}
