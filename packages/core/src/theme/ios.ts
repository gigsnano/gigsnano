import { THEME, type TColorScheme } from "./tokens";

/**
 * iOS design language for the mobile app, modelled on Apple Reminders:
 * grouped-inset surfaces, a per-project tint, large titles and the
 * system text styles. Values are React Native–ready (hex / rgba, points).
 * The web design-system page at /design/mobile renders these same values.
 */

export const IOS_COLOR_ROLES = [
  "background", "surface", "surface-raised", "label", "label-secondary", "label-tertiary",
  "label-quaternary", "separator", "separator-opaque", "fill", "fill-secondary", "fill-tertiary",
  "bar", "scrim", "thumb", "tint", "on-tint", "success", "warning", "destructive",
] as const;
export type TIosColorRole = (typeof IOS_COLOR_ROLES)[number];

/** Apple system grouped colours; tint + semantics come from the brand tokens. */
export const IOS_COLORS: Record<TColorScheme, Record<TIosColorRole, string>> = {
  light: {
    background: "#F2F2F7",
    surface: "#FFFFFF",
    "surface-raised": "#FFFFFF",
    label: "#000000",
    "label-secondary": "rgba(60, 60, 67, 0.6)",
    "label-tertiary": "rgba(60, 60, 67, 0.3)",
    "label-quaternary": "rgba(60, 60, 67, 0.18)",
    separator: "rgba(60, 60, 67, 0.29)",
    "separator-opaque": "#C6C6C8",
    fill: "rgba(120, 120, 128, 0.2)",
    "fill-secondary": "rgba(120, 120, 128, 0.16)",
    "fill-tertiary": "rgba(118, 118, 128, 0.12)",
    bar: "rgba(249, 249, 249, 0.94)",
    scrim: "rgba(0, 0, 0, 0.4)",
    thumb: "#FFFFFF",
    tint: THEME.light.primary,
    "on-tint": "#FFFFFF",
    success: THEME.light.success,
    warning: THEME.light.warning,
    destructive: THEME.light.destructive,
  },
  dark: {
    background: "#000000",
    surface: "#1C1C1E",
    "surface-raised": "#2C2C2E",
    label: "#FFFFFF",
    "label-secondary": "rgba(235, 235, 245, 0.6)",
    "label-tertiary": "rgba(235, 235, 245, 0.3)",
    "label-quaternary": "rgba(235, 235, 245, 0.18)",
    separator: "rgba(84, 84, 88, 0.6)",
    "separator-opaque": "#38383A",
    fill: "rgba(120, 120, 128, 0.36)",
    "fill-secondary": "rgba(120, 120, 128, 0.32)",
    "fill-tertiary": "rgba(118, 118, 128, 0.24)",
    bar: "rgba(22, 22, 24, 0.9)",
    scrim: "rgba(0, 0, 0, 0.6)",
    thumb: "#636366",
    tint: THEME.dark.primary,
    "on-tint": "#FFFFFF",
    success: THEME.dark.success,
    warning: THEME.dark.warning,
    destructive: THEME.dark.destructive,
  },
};

/** Project / list tints — the Reminders list-colour palette. */
export const IOS_TINTS = [
  "red", "orange", "yellow", "green", "teal", "blue", "indigo", "pink", "purple", "brown", "gray",
] as const;
export type TIosTint = (typeof IOS_TINTS)[number];

export const IOS_TINT_COLORS: Record<TColorScheme, Record<TIosTint, string>> = {
  light: {
    red: "#FF3B30", orange: "#FF9500", yellow: "#FFCC00", green: "#34C759", teal: "#30B0C7",
    blue: "#007AFF", indigo: "#5856D6", pink: "#FF2D55", purple: "#AF52DE", brown: "#A2845E",
    gray: "#8E8E93",
  },
  dark: {
    red: "#FF453A", orange: "#FF9F0A", yellow: "#FFD60A", green: "#30D158", teal: "#40C8E0",
    blue: "#0A84FF", indigo: "#5E5CE6", pink: "#FF375F", purple: "#BF5AF2", brown: "#AC8E68",
    gray: "#98989D",
  },
};

export interface IIosTextStyle {
  fontSize: number;
  lineHeight: number;
  /** Points, per Apple's SF tracking table — tighter as size grows. */
  letterSpacing: number;
  fontWeight: "400" | "500" | "600" | "700";
  /** SF Pro Rounded for counts and figures (RN: "ui-rounded" on iOS). */
  rounded?: boolean;
}

/** Apple Dynamic Type text styles at the default (Large) content size. */
export const IOS_TYPE = {
  largeTitle: { fontSize: 34, lineHeight: 41, letterSpacing: 0.4, fontWeight: "700" },
  title1: { fontSize: 28, lineHeight: 34, letterSpacing: 0.38, fontWeight: "700" },
  title2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.26, fontWeight: "700" },
  title3: { fontSize: 20, lineHeight: 25, letterSpacing: -0.45, fontWeight: "600" },
  headline: { fontSize: 17, lineHeight: 22, letterSpacing: -0.43, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 22, letterSpacing: -0.43, fontWeight: "400" },
  callout: { fontSize: 16, lineHeight: 21, letterSpacing: -0.31, fontWeight: "400" },
  subheadline: { fontSize: 15, lineHeight: 20, letterSpacing: -0.23, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, letterSpacing: -0.08, fontWeight: "400" },
  caption1: { fontSize: 12, lineHeight: 16, letterSpacing: 0, fontWeight: "400" },
  caption2: { fontSize: 11, lineHeight: 13, letterSpacing: 0.06, fontWeight: "400" },
  count: { fontSize: 28, lineHeight: 34, letterSpacing: 0.38, fontWeight: "700", rounded: true },
} as const satisfies Record<string, IIosTextStyle>;
export type TIosTextStyle = keyof typeof IOS_TYPE;

/** 4-pt grid. */
export const IOS_SPACE = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const IOS_RADIUS = { sm: 6, md: 10, lg: 12, xl: 16, sheet: 14, pill: 999 } as const;

/** Layout metrics shared by every screen. */
export const IOS_METRICS = {
  gutter: 16,
  /** Minimum touch target and list-row height. */
  hit: 44,
  rowPaddingX: 16,
  rowPaddingY: 11,
  iconCircle: 28,
  statusRing: 22,
  /** Separators start where row text starts, never at the screen edge. */
  separatorInsetIcon: 16 + 28 + 12,
  separatorInsetRing: 16 + 22 + 12,
  tileHeight: 82,
  tabBar: 49,
  navBarInline: 44,
  navBarLarge: 96,
} as const;

/**
 * Springs in Apple's terms. Reanimated: withSpring(v, { dampingRatio, duration: response * 1000 }).
 * Critically damped by default; bounce only after a gesture carried momentum.
 */
export const IOS_SPRING = {
  default: { dampingRatio: 1, response: 0.35 },
  sheet: { dampingRatio: 0.86, response: 0.38 },
  momentum: { dampingRatio: 0.8, response: 0.4 },
  snappy: { dampingRatio: 1, response: 0.22 },
} as const;

export const IOS_MOTION = {
  /** Press feedback fires on touch-down. */
  pressScale: 0.97,
  pressMs: 100,
  fadeMs: 180,
  /** Completed items linger, then leave — the Reminders "undo window". */
  completeLingerMs: 1500,
  easeOut: [0.23, 1, 0.32, 1],
  easeDrawer: [0.32, 0.72, 0, 1],
} as const;

/** expo-haptics call for each moment; nothing else buzzes. */
export const IOS_HAPTICS = {
  complete: "notification.success",
  select: "selection",
  swipeCommit: "impact.medium",
  destructive: "notification.warning",
  longPress: "impact.light",
} as const;

/** Tints a project can wear; gray stays reserved for neutral badges. */
const PROJECT_TINTS = IOS_TINTS.filter((t) => t !== "gray");

/** Stable Reminders-style list colour for a project, derived from its id. */
export function projectTint(id: string): TIosTint {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PROJECT_TINTS[hash % PROJECT_TINTS.length]!;
}

/** `#RRGGBB` at the given opacity, as rgba(); other formats pass through unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
