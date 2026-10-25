import type { CSSProperties, ReactNode } from "react";

import { ios, PRESSABLE, text } from "./ios-css";

export type TIosButtonVariant = "filled" | "tinted" | "gray" | "plain" | "destructive";

const VARIANT: Record<TIosButtonVariant, CSSProperties> = {
  filled: { background: ios("tint"), color: ios("on-tint") },
  tinted: { background: "color-mix(in srgb, var(--ios-tint) 15%, transparent)", color: ios("tint") },
  gray: { background: ios("fill-tertiary"), color: ios("tint") },
  plain: { background: "transparent", color: ios("tint") },
  destructive: { background: "color-mix(in srgb, var(--ios-destructive) 14%, transparent)", color: ios("destructive") },
};

interface IIosButtonProps {
  children: ReactNode;
  variant?: TIosButtonVariant;
  size?: "large" | "small";
  leading?: ReactNode;
  block?: boolean;
}

/** iOS button styles: capsule, 50pt large / 34pt small, label weight carries emphasis. */
export function IosButton({ children, variant = "filled", size = "large", leading, block }: IIosButtonProps) {
  const large = size === "large";
  return (
    <button
      type="button"
      className={`${PRESSABLE} inline-flex items-center justify-center gap-1.5 rounded-full ${large ? "h-[50px] px-5" : "h-[34px] px-3.5"} ${block ? "w-full" : ""}`}
      style={{ ...text(large ? "headline" : "subheadline"), fontWeight: 600, ...VARIANT[variant] }}
    >
      {leading}
      {children}
    </button>
  );
}
