/**
 * Gate the solution platform UI (GIN-445 cohort / rollback).
 *
 * On by default — the chooser and solution-aware shell already ship. Set
 * `NEXT_PUBLIC_SOLUTIONS=false` to fall back to the legacy "create a project"
 * path without the outcome chooser, so a bad cohort can be rolled back without
 * a redeploy of the old dialog. Mirrors the Journey flag pattern, inverted
 * (opt-out rather than opt-in) because expand/contract keeps the new path live.
 */
export const SOLUTIONS_ENABLED = process.env.NEXT_PUBLIC_SOLUTIONS !== "false";
