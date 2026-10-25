import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties, ReactNode } from "react";

import { ios, text } from "./ios-css";

interface IListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned value (count, setting). */
  value?: ReactNode;
  /** Replaces value + chevron (e.g. a switch). */
  accessory?: ReactNode;
  chevron?: boolean;
  /** Where the hairline starts — always at the text, never the edge. */
  separatorInset?: number;
  destructive?: boolean;
  onClick?: () => void;
}

/** 44pt-minimum row: leading badge · title · value · chevron, inset hairline. */
export function ListRow({
  leading, title, subtitle, value, accessory, chevron = true, separatorInset = 16, destructive, onClick,
}: IListRowProps) {
  const body = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate" style={{ ...text("body"), color: destructive ? ios("destructive") : ios("label") }}>
          {title}
        </span>
        {subtitle ? (
          <span className="truncate" style={{ ...text("subheadline"), color: ios("label-secondary") }}>
            {subtitle}
          </span>
        ) : null}
      </span>
      {accessory ?? (
        <>
          {value != null ? (
            <span style={{ ...text("body"), color: ios("label-secondary") }}>{value}</span>
          ) : null}
          {chevron ? (
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} color="var(--ios-label-tertiary)" strokeWidth={2.4} />
          ) : null}
        </>
      )}
    </>
  );
  const className =
    "relative flex min-h-11 w-full items-center gap-3 px-4 py-[11px] after:absolute after:right-0 after:bottom-0 after:left-[var(--sep)] after:h-[0.5px] after:bg-[var(--ios-separator)] last:after:hidden";
  const style = { "--sep": `${separatorInset}px` } as CSSProperties;

  if (!onClick) return <div className={className} style={style}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} transition-colors duration-75 active:bg-[var(--ios-fill-tertiary)]`}
      style={style}
    >
      {body}
    </button>
  );
}
