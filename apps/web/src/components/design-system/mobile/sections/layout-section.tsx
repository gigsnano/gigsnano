import { IOS_HAPTICS, IOS_METRICS, IOS_MOTION, IOS_RADIUS, IOS_SPACE, IOS_SPRING } from "@gigsnano/core";

import { DsSection } from "../ds-section";

function TokenTable({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-border rounded-xl border border-border text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 px-4 py-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-mono text-xs text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Space, radius, metrics, springs and haptics — the numbers behind every screen. */
export function LayoutSection() {
  return (
    <DsSection
      id="layout"
      eyebrow="Tokens"
      title="Layout & motion"
      description="A 4-pt grid, 16-pt gutters, 44-pt rows. Springs are specified Apple-style (damping ratio + response) and map to Reanimated withSpring({ dampingRatio, duration })."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Spacing</h3>
          <div className="flex flex-col gap-2">
            {Object.entries(IOS_SPACE).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 text-xs">
                <span className="w-10 font-mono text-muted-foreground">{k}</span>
                <span className="h-3 rounded-sm bg-primary/70" style={{ width: v * 4 }} />
                <span className="font-mono text-muted-foreground">{v}pt</span>
              </div>
            ))}
          </div>
          <h3 className="mt-4 text-sm font-semibold">Radius</h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(IOS_RADIUS).map(([k, v]) => (
              <div key={k} className="flex flex-col items-center gap-1.5">
                <span className="size-14 border-2 border-primary/60 bg-primary/10" style={{ borderRadius: Math.min(v, 28) }} />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {k} {v === 999 ? "pill" : v}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Metrics</h3>
          <TokenTable rows={Object.entries(IOS_METRICS).map(([k, v]) => [k, `${v}pt`])} />
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Springs</h3>
          <TokenTable
            rows={Object.entries(IOS_SPRING).map(([k, v]) => [k, `damping ${v.dampingRatio} · response ${v.response}s`])}
          />
          <TokenTable
            rows={[
              ["press scale", `${IOS_MOTION.pressScale} · ${IOS_MOTION.pressMs}ms on touch-down`],
              ["fade", `${IOS_MOTION.fadeMs}ms ease-out`],
              ["completed item lingers", `${IOS_MOTION.completeLingerMs}ms, then leaves`],
              ["ease-out", `cubic-bezier(${IOS_MOTION.easeOut.join(", ")})`],
              ["ease-drawer", `cubic-bezier(${IOS_MOTION.easeDrawer.join(", ")})`],
            ]}
          />
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Haptics</h3>
          <TokenTable rows={Object.entries(IOS_HAPTICS)} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Only these five moments buzz. Haptic fires on the same frame as the visual change — never after.
          </p>
        </div>
      </div>
    </DsSection>
  );
}
