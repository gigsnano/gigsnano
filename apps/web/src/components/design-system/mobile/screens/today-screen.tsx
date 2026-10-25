import {
  Alert02Icon,
  Calendar03Icon,
  Flag02Icon,
  Folder01Icon,
  Mic01Icon,
  Search01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { DEMO_PROJECTS } from "../demo-data";
import { IconCircle } from "../icon-circle";
import { ios, text, tint } from "../ios-css";
import { IosScreen } from "../ios-screen";
import { InsetGroup } from "../inset-group";
import { ListRow } from "../list-row";
import { NewItemButton } from "../new-item-button";
import { SmartTile } from "../smart-tile";

/** Home = Reminders' main screen: search, smart tiles, then "My Lists" → Projects. */
export function TodayScreen() {
  return (
    <IosScreen
      title="Today"
      tab="today"
      toolbar={
        <>
          <NewItemButton />
          <span style={{ ...text("body"), color: ios("tint") }}>Add Project</span>
        </>
      }
    >
      <div
        className="-mt-2 flex h-9 items-center gap-1.5 rounded-[10px] px-2"
        style={{ background: ios("fill-tertiary"), color: ios("label-secondary") }}
      >
        <HugeiconsIcon icon={Search01Icon} size={17} color="currentColor" strokeWidth={2} />
        <span className="flex-1" style={text("body")}>Search</span>
        <HugeiconsIcon icon={Mic01Icon} size={17} color="currentColor" strokeWidth={2} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SmartTile icon={Calendar03Icon} color={tint("blue")} label="Due Today" count={5} />
        <SmartTile icon={Flag02Icon} color={tint("orange")} label="Needs You" count={3} />
        <SmartTile icon={Alert02Icon} color={ios("destructive")} label="Overdue" count={2} />
        <SmartTile icon={UserIcon} color={tint("gray")} label="Assigned" count={12} />
      </div>

      <InsetGroup title="Projects" titleSize="large">
        {DEMO_PROJECTS.map((p) => (
          <ListRow
            key={p.id}
            onClick={() => {}}
            leading={<IconCircle icon={Folder01Icon} color={tint(p.tint)} />}
            title={p.name}
            subtitle={p.atRisk ? <span style={{ color: ios("warning") }}>At risk · 3 days behind</span> : undefined}
            value={p.open}
            separatorInset={56}
          />
        ))}
      </InsetGroup>
    </IosScreen>
  );
}
