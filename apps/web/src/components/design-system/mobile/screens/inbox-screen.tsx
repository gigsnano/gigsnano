import { ios, text, tint } from "../ios-css";
import { IosButton } from "../ios-button";
import { IosScreen } from "../ios-screen";
import { IosSegmented } from "../ios-segmented";
import { InsetGroup } from "../inset-group";

const DECISIONS = [
  { id: "d1", title: "Approve PRD v2", meta: "Atlas Mobile · Product Manager agent", time: "2h", color: tint("blue") },
  { id: "d2", title: "Architecture concerns raised", meta: "Ledger Revamp · Readiness gate", time: "5h", color: tint("orange") },
];
const EARLIER = [
  { id: "e1", title: "Maya mentioned you", meta: "“Can you check the offline copy?”", time: "Yesterday" },
  { id: "e2", title: "Assigned: Sync tokens with web theme", meta: "Atlas Mobile", time: "Mon" },
];

/** Inbox: decisions first with inline capsule actions; the rest is a quiet list. */
export function InboxScreen() {
  return (
    <IosScreen title="Inbox" tab="inbox" navTrailing={<span style={text("body")}>Edit</span>}>
      <div className="-mt-2">
        <IosSegmented label="Inbox filter" options={["All", "Decisions", "Mentions"]} />
      </div>

      <InsetGroup title="Needs a decision">
        {DECISIONS.map((d) => (
          <div
            key={d.id}
            className="relative flex gap-3 px-4 py-3 after:absolute after:right-0 after:bottom-0 after:left-[34px] after:h-[0.5px] after:bg-[var(--ios-separator)] last:after:hidden"
          >
            <span className="mt-[7px] size-2.5 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-col">
                <span className="flex justify-between gap-2">
                  <span style={{ ...text("headline"), color: ios("label") }}>{d.title}</span>
                  <span style={{ ...text("subheadline"), color: ios("label-secondary") }}>{d.time}</span>
                </span>
                <span style={{ ...text("subheadline"), color: ios("label-secondary") }}>{d.meta}</span>
              </div>
              <div className="flex gap-2">
                <IosButton size="small">Approve</IosButton>
                <IosButton size="small" variant="gray">Reject</IosButton>
              </div>
            </div>
          </div>
        ))}
      </InsetGroup>

      <InsetGroup title="Earlier">
        {EARLIER.map((e) => (
          <div
            key={e.id}
            className="relative flex flex-col px-4 py-[11px] after:absolute after:right-0 after:bottom-0 after:left-4 after:h-[0.5px] after:bg-[var(--ios-separator)] last:after:hidden"
          >
            <span className="flex justify-between gap-2">
              <span className="truncate" style={{ ...text("body"), color: ios("label") }}>{e.title}</span>
              <span style={{ ...text("subheadline"), color: ios("label-secondary") }}>{e.time}</span>
            </span>
            <span className="truncate" style={{ ...text("subheadline"), color: ios("label-secondary") }}>{e.meta}</span>
          </div>
        ))}
      </InsetGroup>
    </IosScreen>
  );
}
