/**
 * Gate the redesigned work-item detail page (GIN-477). Off by default — the
 * redesign lands over eight slices and the legacy view stays the shipped
 * experience until they're all in. Opt in per environment with
 * `NEXT_PUBLIC_WORK_ITEM_V2=true` (set in `.env.local` for dev/demo).
 *
 * The flag is also the documented fallback during rollout: turning it off
 * restores the legacy view with no deploy. Mirrors the Journey/Gantt flags —
 * a new flag needs BOTH a Dockerfile ARG/ENV line and an `.env.prod` line to
 * survive a production build.
 */
export const WORK_ITEM_DETAIL_V2 = process.env.NEXT_PUBLIC_WORK_ITEM_V2 === "true";
