import { MoreHorizontalCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { DEMO_ITEMS, STATUS_LABEL, type TDemoStatus } from "../demo-data";
import { ios, text, tint } from "../ios-css";
import { IosScreen } from "../ios-screen";
import { WorkItemRow } from "../work-item-row";
import { NewItemButton } from "../new-item-button";

const SECTIONS: TDemoStatus[] = ["review", "in_progress", "todo", "backlog"];

/** A project = a Reminders list: tinted large title, sectioned rows, done items folded away. */
export function ProjectScreen() {
  const color = tint("blue");
  const done = DEMO_ITEMS.filter((i) => i.status === "done").length;
  return (
    <IosScreen
      title="Atlas Mobile"
      titleColor={color}
      titleTrailing={<span style={{ ...text("largeTitle"), color }} className="tabular-nums">14</span>}
      back="Projects"
      navTrailing={<HugeiconsIcon icon={MoreHorizontalCircle01Icon} size={24} color="currentColor" strokeWidth={1.8} />}
      tab="projects"
      toolbar={<NewItemButton />}
    >
      <p className="-mt-3 flex justify-between px-1" style={{ ...text("subheadline"), color: ios("label-secondary") }}>
        <span>{done} Done · <span style={{ color }}>Show</span></span>
        <span>Sprint 4 · 6 days left</span>
      </p>
      {SECTIONS.map((s) => {
        const items = DEMO_ITEMS.filter((i) => i.status === s);
        if (items.length === 0) return null;
        return (
          <section key={s} className="flex flex-col gap-1.5">
            <h3 className="px-1" style={{ ...text("headline"), color: ios("label") }}>
              {STATUS_LABEL[s]}
            </h3>
            <div className="overflow-hidden rounded-xl" style={{ background: ios("surface") }}>
              {items.map((item) => (
                <WorkItemRow key={item.id} item={item} color={color} />
              ))}
            </div>
          </section>
        );
      })}
    </IosScreen>
  );
}
