import { IOS_TYPE, type TColorScheme, type TIosTextStyle } from "@gigsnano/core";

import { DsSection } from "../ds-section";
import { IosCanvas } from "../ios-canvas";
import { ios, text } from "../ios-css";

const USE: Record<TIosTextStyle, string> = {
  largeTitle: "Screen titles (collapses on scroll)",
  title1: "Sheet hero, empty-state title",
  title2: "Section titles — “Projects”",
  title3: "Card titles",
  headline: "Section headers, inline nav title, emphasis",
  body: "Row titles, item titles, fields",
  callout: "Explanations inside cards",
  subheadline: "Notes, meta lines, row subtitles",
  footnote: "Group headers and footers",
  caption1: "Timestamps, swipe-action labels",
  caption2: "Badges, chart ticks",
  count: "Smart-tile counts (SF Rounded)",
};

/** The Dynamic Type ramp with live specimens. */
export function TypeSection({ scheme }: { scheme: TColorScheme }) {
  return (
    <DsSection
      id="type"
      eyebrow="Tokens"
      title="Typography"
      description="SF Pro via the system font (RN fontFamily “System”), sized to Apple's text styles at the default Dynamic Type size. Tracking follows Apple's table: positive at large sizes, negative in the body range. Replaces today's Inter 25/14/12 + uppercase labels."
    >
      <IosCanvas scheme={scheme} className="divide-y divide-[var(--ios-separator)] !p-0">
        {(Object.keys(IOS_TYPE) as TIosTextStyle[]).map((key) => {
          const s = IOS_TYPE[key];
          return (
            <div key={key} className="grid items-baseline gap-2 px-5 py-3 sm:grid-cols-[1fr_200px_220px]">
              <span className="truncate" style={{ ...text(key), color: ios("label") }}>
                {key === "count" ? "12" : "Wire push permission prompt"}
              </span>
              <span className="font-mono text-[11px]" style={{ color: ios("label-secondary") }}>
                {key} · {s.fontSize}/{s.lineHeight} · {s.fontWeight} · {s.letterSpacing > 0 ? "+" : ""}
                {s.letterSpacing}
              </span>
              <span style={{ ...text("footnote"), color: ios("label-secondary") }}>{USE[key]}</span>
            </div>
          );
        })}
      </IosCanvas>
    </DsSection>
  );
}
