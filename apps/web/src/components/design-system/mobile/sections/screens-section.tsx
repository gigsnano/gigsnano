import type { TColorScheme } from "@gigsnano/core";

import { DsSection } from "../ds-section";
import { PhoneFrame } from "../phone-frame";
import { DetailSheetScreen } from "../screens/detail-sheet-screen";
import { InboxScreen } from "../screens/inbox-screen";
import { ProjectScreen } from "../screens/project-screen";
import { TodayScreen } from "../screens/today-screen";

/** The system assembled into the four core screens. */
export function ScreensSection({ scheme }: { scheme: TColorScheme }) {
  return (
    <DsSection
      id="screens"
      eyebrow="Composition"
      title="Screens"
      description="Scroll inside a phone to watch the large title collapse into the bar and the material appear. Fictional data."
    >
      <div className="-mx-4 flex snap-x snap-mandatory gap-10 overflow-x-auto px-4 pb-6 [scrollbar-width:thin]">
        <div className="snap-center"><PhoneFrame scheme={scheme} caption="Today — smart tiles + projects"><TodayScreen /></PhoneFrame></div>
        <div className="snap-center"><PhoneFrame scheme={scheme} caption="Project — a Reminders list"><ProjectScreen /></PhoneFrame></div>
        <div className="snap-center"><PhoneFrame scheme={scheme} caption="Item details — sheet over a receding list"><DetailSheetScreen /></PhoneFrame></div>
        <div className="snap-center"><PhoneFrame scheme={scheme} caption="Inbox — decisions first"><InboxScreen /></PhoneFrame></div>
      </div>
    </DsSection>
  );
}
