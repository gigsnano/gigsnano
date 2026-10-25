import { oklchToCss } from "./oklch";

export const TOKEN_ROLES = [
  "background", "foreground", "muted", "muted-foreground", "border",
  "primary", "primary-foreground", "destructive", "success", "warning",
] as const;
export type TTokenRole = (typeof TOKEN_ROLES)[number];
export type TColorScheme = "light" | "dark";

/** Verbatim from src/app/globals.css — a parity test fails when they drift. */
export const OKLCH_TOKENS: Record<TColorScheme, Record<TTokenRole, string>> = {
  light: {
    background: "oklch(1 0 0)",
    foreground: "oklch(0.2378 0.0029 230.83)",
    muted: "oklch(0.9543 0.001 230.67)",
    "muted-foreground": "oklch(0.4377 0.0066 230.87)",
    border: "oklch(0.9235 0.001733 230.6853)",
    primary: "oklch(0.4799 0.1158 242.91)",
    "primary-foreground": "oklch(0.9848 0.0003 230.66)",
    destructive: "oklch(0.583 0.238666 28.4765)",
    success: "oklch(0.53 0.12 155)",
    warning: "oklch(0.555 0.13 62)",
  },
  dark: {
    background: "oklch(0.1689 0.0021 230.81)",
    foreground: "oklch(0.9235 0.001733 230.6853)",
    muted: "oklch(0.1932 0.002 230.81)",
    "muted-foreground": "oklch(0.8455 0.0035 230.72)",
    border: "oklch(1 0 0 / 10%)",
    primary: "oklch(0.6311 0.126281 238.01)",
    "primary-foreground": "oklch(0.1689 0.0021 230.81)",
    destructive: "oklch(0.7022 0.1892 22.23)",
    success: "oklch(0.75 0.14 155)",
    warning: "oklch(0.8 0.14 75)",
  },
};

function convert(tokens: Record<TTokenRole, string>): Record<TTokenRole, string> {
  return Object.fromEntries(
    TOKEN_ROLES.map((role) => [role, oklchToCss(tokens[role])]),
  ) as Record<TTokenRole, string>;
}

/** React Native–ready colours (hex, or rgba for translucent tokens). */
export const THEME: Record<TColorScheme, Record<TTokenRole, string>> = {
  light: convert(OKLCH_TOKENS.light),
  dark: convert(OKLCH_TOKENS.dark),
};
