"use client";

import { useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterHorizontalIcon, DragDropVerticalIcon } from "@hugeicons/core-free-icons";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PERSONAL_ITEMS,
  WORKSPACE_ITEMS,
  type ISidebarNavItem,
  type ISidebarPref,
} from "@/lib/nav/sidebar-nav-items";
import { useSidebarNav } from "@/store/ui/sidebar-nav.store";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** One draggable, checkable row inside a group. */
function NavPrefRow({
  pref,
  item,
  onToggle,
}: {
  pref: ISidebarPref;
  item: ISidebarNavItem;
  onToggle: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={pref}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.02 }}
      transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
      className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 shadow-2xs transition-colors hover:border-ring/40"
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        onPointerDown={(e) => controls.start(e)}
        className="flex cursor-grab touch-none items-center rounded-sm text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4" />
      </button>
      <Checkbox checked={pref.pinned} onCheckedChange={onToggle} />
      <HugeiconsIcon icon={item.icon} className="size-4 text-muted-foreground" />
      <span className="text-sm">{item.label}</span>
    </Reorder.Item>
  );
}

/** A titled, reorderable group (Personal / Workspace). */
function NavPrefGroup({
  title,
  prefs,
  catalog,
  onReorder,
  onToggle,
}: {
  title: string;
  prefs: ISidebarPref[];
  catalog: ISidebarNavItem[];
  onReorder: (order: ISidebarPref[]) => void;
  onToggle: (id: string) => void;
}) {
  const byId = new Map(catalog.map((c) => [c.id, c] as const));
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <Reorder.Group
        axis="y"
        values={prefs}
        onReorder={onReorder}
        className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2"
      >
        {prefs.map((pref) => {
          const item = byId.get(pref.id);
          if (!item) return null;
          return (
            <NavPrefRow
              key={pref.id}
              pref={pref}
              item={item}
              onToggle={() => onToggle(pref.id)}
            />
          );
        })}
      </Reorder.Group>
    </div>
  );
}

/** The Customize-navigation modal + its trigger button. */
export function CustomizeNavDialog() {
  const [open, setOpen] = useState(false);
  const personal = useSidebarNav((s) => s.personal);
  const workspace = useSidebarNav((s) => s.workspace);
  const limitProjects = useSidebarNav((s) => s.limitProjects);
  const projectLimit = useSidebarNav((s) => s.projectLimit);
  const setGroup = useSidebarNav((s) => s.setGroup);
  const togglePinned = useSidebarNav((s) => s.togglePinned);
  const setLimitProjects = useSidebarNav((s) => s.setLimitProjects);
  const setProjectLimit = useSidebarNav((s) => s.setProjectLimit);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Customize navigation">
          <HugeiconsIcon icon={FilterHorizontalIcon} className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Customize navigation</DialogTitle>
        <DialogDescription className="text-muted-foreground">
          Selected items will always stay visible in your sidebar. You can still find the
          others anytime from the More menu. These changes are personal to you and won&apos;t
          affect anyone else on your workspace.
        </DialogDescription>

        <div className="mt-4 flex max-h-[60vh] flex-col gap-5 overflow-y-auto pr-1">
          <NavPrefGroup
            title="Personal"
            prefs={personal}
            catalog={PERSONAL_ITEMS}
            onReorder={(order) => setGroup("personal", order)}
            onToggle={(id) => togglePinned("personal", id)}
          />
          <NavPrefGroup
            title="Workspace"
            prefs={workspace}
            catalog={WORKSPACE_ITEMS}
            onReorder={(order) => setGroup("workspace", order)}
            onToggle={(id) => togglePinned("workspace", id)}
          />

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Projects</h3>
            <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
              <Checkbox
                id="limit-projects"
                aria-label="Show limited projects on sidebar"
                checked={limitProjects}
                onCheckedChange={(v) => setLimitProjects(v === true)}
              />
              <Label htmlFor="limit-projects" className="text-sm font-normal">
                Show limited projects on sidebar
              </Label>
            </div>
            {limitProjects ? (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Enter number of projects
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={projectLimit}
                  onChange={(e) => setProjectLimit(Number(e.target.value))}
                  className={cn(field, "w-32")}
                />
              </label>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
