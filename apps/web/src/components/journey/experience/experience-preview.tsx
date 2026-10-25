import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import type { Density, ITokens } from "@/lib/journey/experience";

type Device = "desktop" | "mobile";

const DENSITY_PAD: Record<Density, number> = { spacious: 20, comfortable: 14, compact: 8 };
const DENSITY_GAP: Record<Density, number> = { spacious: 16, comfortable: 12, compact: 6 };

const PALETTE = {
  light: { bg: "#ffffff", panel: "#f6f7f9", ink: "#0f172a", muted: "#64748b", line: "#e2e8f0" },
  dark: { bg: "#0b1120", panel: "#131a2b", ink: "#e8edf6", muted: "#94a3b8", line: "#233047" },
};

/**
 * Representative application preview that reflects the live tokens (accent,
 * radius, density, theme) and template. Not real generated UI — a faithful
 * stand-in so the user can visually judge the direction before approving.
 */
export function ExperiencePreview({
  device,
  tokens,
  templateName,
}: {
  device: Device;
  tokens: ITokens;
  templateName: string;
}) {
  const c = PALETTE[tokens.theme];
  const pad = DENSITY_PAD[tokens.density];
  const gap = DENSITY_GAP[tokens.density];
  const r = tokens.radius;
  const fontStack =
    tokens.typography === "classic"
      ? "Georgia, 'Times New Roman', serif"
      : tokens.typography === "humanist"
        ? "'Segoe UI', system-ui, sans-serif"
        : "ui-sans-serif, system-ui, sans-serif";

  const shell: CSSProperties = { background: c.bg, color: c.ink, fontFamily: fontStack };
  const card: CSSProperties = { background: c.panel, borderRadius: r, border: `1px solid ${c.line}` };

  const isMobile = device === "mobile";

  return (
    <div className="flex justify-center">
      <div
        className="overflow-hidden border shadow-sm transition-[width] duration-300 ease-out"
        style={{ ...shell, borderRadius: Math.max(r, 8), borderColor: c.line, width: isMobile ? 260 : "100%", maxWidth: isMobile ? 260 : 720 }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between" style={{ padding: pad, borderBottom: `1px solid ${c.line}` }}>
          <div className="flex items-center gap-2">
            <span style={{ width: 18, height: 18, borderRadius: r / 1.5, background: tokens.accent }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>{templateName}</span>
          </div>
          <span style={{ background: tokens.accent, color: "#fff", borderRadius: r, padding: "5px 10px", fontSize: 11, fontWeight: 600 }}>
            New
          </span>
        </div>

        <div className="flex" style={{ minHeight: 220 }}>
          {/* Side nav (desktop) */}
          {!isMobile ? (
            <div style={{ width: 132, padding: pad, borderRight: `1px solid ${c.line}`, display: "flex", flexDirection: "column", gap: gap / 2 }}>
              {["Overview", "Reports", "Team", "Settings"].map((item, i) => (
                <span
                  key={item}
                  style={{
                    fontSize: 12,
                    padding: "6px 8px",
                    borderRadius: r / 1.5,
                    background: i === 0 ? tokens.accent + "1f" : "transparent",
                    color: i === 0 ? tokens.accent : c.muted,
                    fontWeight: i === 0 ? 600 : 400,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          {/* Content */}
          <div style={{ flex: 1, padding: pad, display: "flex", flexDirection: "column", gap }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Overview</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap }}>
              {[0, 1, 2].slice(0, isMobile ? 2 : 3).map((i) => (
                <div key={i} style={{ ...card, padding: pad * 0.7 }}>
                  <div style={{ fontSize: 10, color: c.muted }}>Metric {i + 1}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{[128, 42, 96][i]}</div>
                </div>
              ))}
            </div>
            <div style={{ ...card, padding: pad * 0.8 }}>
              <div style={{ fontSize: 11, color: c.muted, marginBottom: 8 }}>Activity</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 56 }}>
                {[40, 70, 30, 90, 55, 75].map((h, i) => (
                  <span key={i} style={{ flex: 1, height: `${h}%`, background: i === 3 ? tokens.accent : tokens.accent + "55", borderRadius: r / 2 }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom nav (mobile) */}
        {isMobile ? (
          <div style={{ display: "flex", justifyContent: "space-around", padding: 10, borderTop: `1px solid ${c.line}` }}>
            {["Home", "Search", "Profile"].map((item, i) => (
              <span key={item} style={{ fontSize: 10, color: i === 0 ? tokens.accent : c.muted, fontWeight: i === 0 ? 600 : 400 }}>
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { type Device as PreviewDevice };
