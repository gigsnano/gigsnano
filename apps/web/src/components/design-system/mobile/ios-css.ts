import {
  IOS_COLORS,
  IOS_TINT_COLORS,
  IOS_TYPE,
  type TColorScheme,
  type TIosColorRole,
  type TIosTextStyle,
  type TIosTint,
} from "@gigsnano/core";
import type { CSSProperties } from "react";

/** SF Pro on Apple devices; Inter elsewhere — mirrors RN's "System" font on iOS. */
export const IOS_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", var(--font-sans), system-ui, sans-serif';
export const IOS_FONT_ROUNDED = `ui-rounded, "SF Pro Rounded", ${IOS_FONT}`;

/** Scopes the iOS colour roles + tints as CSS variables on a phone frame. */
export function iosVars(scheme: TColorScheme): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [role, value] of Object.entries(IOS_COLORS[scheme])) vars[`--ios-${role}`] = value;
  for (const [name, value] of Object.entries(IOS_TINT_COLORS[scheme])) vars[`--ios-tint-${name}`] = value;
  return vars as CSSProperties;
}

export const ios = (role: TIosColorRole) => `var(--ios-${role})`;
export const tint = (name: TIosTint) => `var(--ios-tint-${name})`;

export function text(style: TIosTextStyle): CSSProperties {
  const s = IOS_TYPE[style];
  return {
    fontSize: s.fontSize,
    lineHeight: `${s.lineHeight}px`,
    letterSpacing: s.letterSpacing,
    fontWeight: Number(s.fontWeight),
    fontFamily: "rounded" in s && s.rounded ? IOS_FONT_ROUNDED : IOS_FONT,
  };
}

/** Shared pressable feel: scale on touch-down, instant. */
export const PRESSABLE =
  "transition-transform duration-100 ease-out active:scale-[0.97] motion-reduce:active:scale-100 select-none";
