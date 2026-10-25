import { IOS_COLOR_ROLES, IOS_COLORS, IOS_TINTS, IOS_TINT_COLORS, type TColorScheme } from "@gigsnano/core";

import { DsSection } from "../ds-section";
import { IosCanvas } from "../ios-canvas";
import { ios, text } from "../ios-css";

const SCHEMES: TColorScheme[] = ["light", "dark"];

/** Semantic roles + project tints, both appearances side by side. */
export function ColorSection() {
  return (
    <DsSection
      id="color"
      eyebrow="Tokens"
      title="Color"
      description="Apple's grouped system colours for surfaces and labels; tint and status colours come from the brand tokens so web and mobile stay one product. Labels use alpha, so they sit correctly on any surface."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {SCHEMES.map((scheme) => (
          <IosCanvas key={scheme} scheme={scheme}>
            <p style={{ ...text("footnote"), color: ios("label-secondary") }} className="mb-3 capitalize">
              {scheme}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
              {IOS_COLOR_ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2.5">
                  <span
                    className="size-8 shrink-0 rounded-lg"
                    style={{ background: IOS_COLORS[scheme][role], boxShadow: "inset 0 0 0 0.5px var(--ios-separator)" }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate" style={{ ...text("footnote"), fontWeight: 600 }}>{role}</span>
                    <span className="block truncate font-mono text-[10px]" style={{ color: ios("label-secondary") }}>
                      {IOS_COLORS[scheme][role]}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <p style={{ ...text("footnote"), color: ios("label-secondary") }} className="mt-6 mb-3">
              Project tints
            </p>
            <div className="flex flex-wrap gap-3">
              {IOS_TINTS.map((t) => (
                <span key={t} className="flex flex-col items-center gap-1">
                  <span className="size-9 rounded-full" style={{ background: IOS_TINT_COLORS[scheme][t] }} />
                  <span style={{ ...text("caption2"), color: ios("label-secondary") }}>{t}</span>
                </span>
              ))}
            </div>
          </IosCanvas>
        ))}
      </div>
    </DsSection>
  );
}
