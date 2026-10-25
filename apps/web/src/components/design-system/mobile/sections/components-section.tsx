import {
  Alert02Icon,
  Calendar03Icon,
  Flag02Icon,
  Folder01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TColorScheme } from "@gigsnano/core";
import type { ReactNode } from "react";

import { DEMO_ITEMS, STATUS_LABEL, type TDemoStatus } from "../demo-data";
import { DsSection } from "../ds-section";
import { IconCircle } from "../icon-circle";
import { IosButton } from "../ios-button";
import { IosCanvas } from "../ios-canvas";
import { ios, text, tint } from "../ios-css";
import { IosSegmented } from "../ios-segmented";
import { IosSwitch } from "../ios-switch";
import { InsetGroup } from "../inset-group";
import { ListRow } from "../list-row";
import { SmartTile } from "../smart-tile";
import { StatusRing } from "../status-ring";
import { WorkItemRow } from "../work-item-row";

const STATUSES: TDemoStatus[] = ["backlog", "todo", "in_progress", "review", "done"];

function Specimen({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p style={{ ...text("headline"), color: ios("label") }}>{name}</p>
        <p style={{ ...text("footnote"), color: ios("label-secondary") }}>{note}</p>
      </div>
      {children}
    </div>
  );
}

/** Every building block, live and interactive, in the chosen appearance. */
export function ComponentsSection({ scheme }: { scheme: TColorScheme }) {
  const blue = tint("blue");
  return (
    <DsSection
      id="components"
      eyebrow="Library"
      title="Components"
      description="Each maps to one React Native component. Everything here is interactive: tap rings and switches, drag a work item left to reveal its actions (flick it — the release velocity decides)."
    >
      <IosCanvas scheme={scheme} className="grid gap-10 md:grid-cols-2">
        <Specimen name="Status ring" note="Tap to complete. Tint = project. Pie = progress.">
          <div className="flex flex-wrap gap-5">
            {STATUSES.map((s) => (
              <span key={s} className="flex flex-col items-center gap-1.5">
                <StatusRing status={s} color={blue} />
                <span style={{ ...text("caption1"), color: ios("label-secondary") }}>{STATUS_LABEL[s]}</span>
              </span>
            ))}
          </div>
        </Specimen>

        <Specimen name="Buttons" note="Capsules. Filled = primary, one per view. Gray for the alternative.">
          <div className="flex flex-wrap items-center gap-2">
            <IosButton size="small">Approve</IosButton>
            <IosButton size="small" variant="tinted">Assign</IosButton>
            <IosButton size="small" variant="gray">Reject</IosButton>
            <IosButton size="small" variant="destructive">Delete</IosButton>
            <IosButton size="small" variant="plain">Show</IosButton>
          </div>
          <IosButton block leading={<HugeiconsIcon icon={PlusSignIcon} size={18} color="currentColor" strokeWidth={2.6} />}>
            Create Work Item
          </IosButton>
        </Specimen>

        <Specimen name="Smart tiles" note="Count is the headline. 2-up grid, 12pt gap.">
          <div className="grid grid-cols-2 gap-3">
            <SmartTile icon={Calendar03Icon} color={blue} label="Due Today" count={5} />
            <SmartTile icon={Flag02Icon} color={tint("orange")} label="Needs You" count={3} />
          </div>
        </Specimen>

        <Specimen name="Segmented control & switch" note="Thumb slides on ease-out; switch is green when on.">
          <IosSegmented label="Range" options={["Week", "Month", "Quarter"]} />
          <div className="flex items-center gap-3">
            <IosSwitch label="Notifications" defaultOn />
            <IosSwitch label="Flag" />
          </div>
        </Specimen>

        <Specimen name="Grouped list" note="Badge · title · value · chevron. Hairline starts at the text.">
          <InsetGroup title="Projects" titleSize="large">
            <ListRow onClick={() => {}} leading={<IconCircle icon={Folder01Icon} color={blue} />} title="Atlas Mobile" value={14} separatorInset={56} />
            <ListRow
              onClick={() => {}}
              leading={<IconCircle icon={Folder01Icon} color={tint("orange")} />}
              title="Ledger Revamp"
              subtitle={<span style={{ color: ios("warning") }}>At risk · 3 days behind</span>}
              value={9}
              separatorInset={56}
            />
            <ListRow onClick={() => {}} leading={<IconCircle icon={Alert02Icon} color={ios("destructive")} />} title="Sign Out" chevron={false} destructive separatorInset={56} />
          </InsetGroup>
        </Specimen>

        <Specimen name="Work item row" note="Drag left ← (or flick). Rubber-bands past the edge.">
          <div className="overflow-hidden rounded-xl" style={{ background: ios("surface") }}>
            {DEMO_ITEMS.slice(0, 3).map((item) => (
              <WorkItemRow key={item.id} item={item} color={blue} showProject="Atlas Mobile" />
            ))}
          </div>
        </Specimen>
      </IosCanvas>
    </DsSection>
  );
}
