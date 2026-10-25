/**
 * Shared Plane-style property-chip trigger for the work-item detail meta row.
 * Flat and borderless (no boxed pills): muted icon + label, quiet hover fill,
 * subtle press feedback. Every property picker's trigger uses this so the row
 * reads as one cohesive, calm set of controls.
 */
export const propertyTrigger =
  "inline-flex h-7 max-w-full items-center gap-1.5 rounded-md px-2 text-sm font-normal text-muted-foreground outline-none transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
