/**
 * Gate the adaptive Project Journey (GIN-427) frontend vertical. Off by default
 * — the whole vertical is mock-driven and its Phase 0/1 backend prerequisites
 * (GIN-434) don't exist yet, so it must not surface to real users on a prod
 * deploy. Opt in per environment with `NEXT_PUBLIC_JOURNEY=true` (set in
 * `.env.local` for dev/demo). Mirrors the Gantt flag pattern.
 */
export const JOURNEY_ENABLED = process.env.NEXT_PUBLIC_JOURNEY === "true";
