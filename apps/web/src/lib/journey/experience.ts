/**
 * Experience Studio model (GIN-431) — pure presets + contract builder.
 *
 * Directions and templates are curated internal starting points (the ticket
 * asks for 3–5 quality directions, not a marketplace). A real agent run would
 * generate these; here they're deterministic fixtures the preview reflects live.
 */

export type Density = "spacious" | "comfortable" | "compact";
export type Typography = "geometric" | "humanist" | "classic";
export type Motion = "subtle" | "expressive" | "none";
export type Theme = "light" | "dark";

export interface ITokens {
  accent: string;
  radius: number;
  density: Density;
  typography: Typography;
  motion: Motion;
  theme: Theme;
}

export interface IDirection {
  id: string;
  name: string;
  blurb: string;
  tokens: Pick<ITokens, "accent" | "radius" | "density" | "typography">;
}

export const DIRECTIONS: IDirection[] = [
  {
    id: "calm",
    name: "Calm enterprise",
    blurb: "Airy, trustworthy, generous spacing. Reads as considered and premium.",
    tokens: { accent: "#3b6ef5", radius: 12, density: "spacious", typography: "humanist" },
  },
  {
    id: "focused",
    name: "Focused modern",
    blurb: "Balanced and confident. Product-first, crisp hierarchy, little chrome.",
    tokens: { accent: "#6d5efc", radius: 10, density: "comfortable", typography: "geometric" },
  },
  {
    id: "dense",
    name: "Dense operations",
    blurb: "Information-dense and efficient. A control-room feel for power users.",
    tokens: { accent: "#0ea5a4", radius: 6, density: "compact", typography: "geometric" },
  },
];

export interface ITemplate {
  id: string;
  name: string;
  blurb: string;
  fit: string;
}

export const TEMPLATES: ITemplate[] = [
  { id: "saas-dashboard", name: "SaaS dashboard", blurb: "Sidebar + metric cards + tables.", fit: "Analytics-heavy B2B products." },
  { id: "marketplace", name: "Marketplace", blurb: "Search, listings, detail, checkout.", fit: "Two-sided buy/sell platforms." },
  { id: "ops-console", name: "Operations console", blurb: "Dense grids, filters, bulk actions.", fit: "Internal tooling & support." },
  { id: "mobile-service", name: "Mobile service app", blurb: "Bottom nav, cards, quick actions.", fit: "On-the-go consumer apps." },
  { id: "booking", name: "Booking flow", blurb: "Calendar, slots, confirmation.", fit: "Scheduling & reservations." },
  { id: "content", name: "Content product", blurb: "Feed, reader, library.", fit: "Media & publishing." },
  { id: "portal", name: "Internal portal", blurb: "Nav hub, apps, announcements.", fit: "Employee/customer portals." },
  { id: "blank", name: "Blank", blurb: "Start from tokens only.", fit: "Bespoke or unusual products." },
];

export const ENTRY_MODES = ["Recommended", "Templates", "Generate", "Import", "Blank", "Preserve existing"] as const;
export type EntryMode = (typeof ENTRY_MODES)[number];

export const DEFAULT_TOKENS: ITokens = {
  accent: DIRECTIONS[1].tokens.accent,
  radius: DIRECTIONS[1].tokens.radius,
  density: "comfortable",
  typography: "geometric",
  motion: "subtle",
  theme: "light",
};

/** Merge a direction's characteristic tokens over the current set (keeps theme/motion). */
export function applyDirection(tokens: ITokens, direction: IDirection): ITokens {
  return { ...tokens, ...direction.tokens };
}

/** Representative screen inventory for a template — drives the preview + contract. */
export function screensFor(templateId: string): string[] {
  const common = ["App shell", "Home / overview"];
  const byTemplate: Record<string, string[]> = {
    "saas-dashboard": ["Dashboard", "Reports", "Settings"],
    marketplace: ["Browse", "Listing detail", "Checkout"],
    "ops-console": ["Queue", "Record detail", "Bulk actions"],
    "mobile-service": ["Feed", "Detail", "Profile"],
    booking: ["Calendar", "Slot picker", "Confirmation"],
    content: ["Feed", "Reader", "Library"],
    portal: ["Hub", "App view", "Announcements"],
    blank: [],
  };
  return [...common, ...(byTemplate[templateId] ?? [])];
}

export interface IExperienceContract {
  version: number;
  directionId: string;
  directionName: string;
  templateId: string;
  tokens: ITokens;
  screens: string[];
  approver: string;
  openDecisions: string[];
}

export function buildExperienceContract(input: {
  version: number;
  direction: IDirection;
  templateId: string;
  tokens: ITokens;
  approver: string;
  openDecisions: string[];
}): IExperienceContract {
  return {
    version: input.version,
    directionId: input.direction.id,
    directionName: input.direction.name,
    templateId: input.templateId,
    tokens: input.tokens,
    screens: screensFor(input.templateId),
    approver: input.approver,
    openDecisions: input.openDecisions,
  };
}
