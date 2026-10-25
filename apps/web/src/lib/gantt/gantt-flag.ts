/**
 * Route the Work Items Gantt to the dhtmlx-gantt foundation (GIN-349 / GIN-315
 * Phase 1) instead of the current custom Gantt. Off by default — the two live
 * side by side while the enterprise phases (GIN-350..353) land; opt in per
 * environment with `NEXT_PUBLIC_GANTT_DHTMLX=true`.
 */
export const DHTMLX_GANTT_ENABLED = process.env.NEXT_PUBLIC_GANTT_DHTMLX === "true";
