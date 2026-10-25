import {
  Calendar03Icon,
  Comment01Icon,
  Flag02Icon,
  Folder01Icon,
  Clock01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";

import { IconCircle } from "../icon-circle";
import { ios, text, tint } from "../ios-css";
import { IosSwitch } from "../ios-switch";
import { InsetGroup } from "../inset-group";
import { ListRow } from "../list-row";
import { StatusRing } from "../status-ring";
import { ProjectScreen } from "./project-screen";

/**
 * Item details = Reminders' "Details" sheet: the parent list dims and recedes,
 * the sheet rises with a grabber, Cancel / Done in the bar.
 */
export function DetailSheetScreen() {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-black">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex origin-top flex-col overflow-hidden rounded-[44px]"
        style={{ transform: "translateY(12px) scale(0.92)", background: ios("background"), filter: "brightness(0.6)" }}
      >
        <ProjectScreen />
      </div>

      <div
        className="absolute inset-x-0 top-[58px] bottom-0 z-10 flex flex-col overflow-hidden rounded-t-[14px]"
        style={{ background: ios("background") }}
      >
        <span className="mx-auto mt-[5px] h-[5px] w-9 rounded-full" style={{ background: ios("label-tertiary") }} />
        <div className="flex h-11 items-center justify-between px-4">
          <span style={{ ...text("body"), color: ios("tint") }}>Cancel</span>
          <span style={{ ...text("headline"), color: ios("label") }}>Details</span>
          <span style={{ ...text("headline"), color: ios("tint") }}>Done</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto [&>*]:shrink-0 px-4 pt-2 pb-12 [scrollbar-width:none]">
          <div className="flex flex-col overflow-hidden rounded-xl" style={{ background: ios("surface") }}>
            <span className="px-4 py-[11px]" style={{ ...text("body"), color: ios("label") }}>
              Wire push permission prompt
            </span>
            <span className="mx-4 h-[0.5px]" style={{ background: ios("separator") }} />
            <span className="px-4 py-[11px]" style={{ ...text("body"), color: ios("label-secondary"), minHeight: 66 }}>
              Ask after first completed item, not on launch
            </span>
          </div>

          <InsetGroup>
            <ListRow
              leading={<StatusRing status="in_progress" color={tint("blue")} size={28} />}
              title="Status" value="In progress" separatorInset={56} onClick={() => {}}
            />
            <ListRow
              leading={<IconCircle icon={Calendar03Icon} color={ios("destructive")} />}
              title="Due" subtitle={<span style={{ color: ios("tint") }}>Today, 3:00 PM</span>}
              accessory={<IosSwitch label="Due date" defaultOn />} separatorInset={56}
            />
            <ListRow
              leading={<IconCircle icon={Flag02Icon} color={tint("orange")} />}
              title="Flag" accessory={<IosSwitch label="Flag" />} separatorInset={56}
            />
          </InsetGroup>

          <InsetGroup>
            <ListRow leading={<IconCircle icon={UserIcon} color={tint("indigo")} />} title="Assignee" value="Maya K." separatorInset={56} onClick={() => {}} />
            <ListRow leading={<IconCircle icon={Folder01Icon} color={tint("blue")} />} title="Project" value="Atlas Mobile" separatorInset={56} onClick={() => {}} />
            <ListRow leading={<IconCircle icon={Clock01Icon} color={tint("teal")} />} title="Cycle" value="Sprint 4" separatorInset={56} onClick={() => {}} />
            <ListRow title="Priority" value="High" onClick={() => {}} />
          </InsetGroup>

          <InsetGroup title="Comments" footer="Comments sync with the web app.">
            <ListRow
              leading={<IconCircle icon={Comment01Icon} color={tint("gray")} />}
              title="Rui S." subtitle="Copy approved — ship with the banner." chevron={false} separatorInset={56}
            />
            <ListRow title={<span style={{ color: ios("tint") }}>Add Comment</span>} chevron={false} onClick={() => {}} />
          </InsetGroup>
        </div>
      </div>
    </div>
  );
}
