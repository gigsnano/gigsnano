import { EWidgetDateRange } from "@/types";

/** Display names for the date-window presets, shared by widget and dashboard filters. */
export const DATE_RANGE_LABELS: Record<EWidgetDateRange, string> = {
  [EWidgetDateRange.All]: "All time",
  [EWidgetDateRange.Last7]: "Last 7 days",
  [EWidgetDateRange.Last30]: "Last 30 days",
  [EWidgetDateRange.Last90]: "Last 90 days",
  [EWidgetDateRange.Custom]: "Custom range",
};
