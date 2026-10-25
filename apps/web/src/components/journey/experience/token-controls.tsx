import { cn } from "@/lib/utils";
import type { Density, Motion, Theme, Typography, ITokens } from "@/lib/journey/experience";

const ACCENTS = ["#3b6ef5", "#6d5efc", "#0ea5a4", "#f43f5e", "#f59e0b", "#10b981"];
const RADII: { label: string; value: number }[] = [
  { label: "Sharp", value: 4 },
  { label: "Rounded", value: 10 },
  { label: "Soft", value: 16 },
];

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="inline-flex w-full rounded-lg bg-muted p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-[color,background-color] duration-150 ease-out",
              value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Left "Decisions" panel — brand tokens, density, navigation, accessibility. */
export function TokenControls({
  tokens,
  onChange,
  nav,
  onNav,
  a11y,
  onA11y,
}: {
  tokens: ITokens;
  onChange: (patch: Partial<ITokens>) => void;
  nav: "sidebar" | "topbar";
  onNav: (v: "sidebar" | "topbar") => void;
  a11y: "AA" | "AAA";
  onA11y: (v: "AA" | "AAA") => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Decisions</h2>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Brand accent</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              aria-label={`Accent ${a}`}
              aria-pressed={tokens.accent === a}
              onClick={() => onChange({ accent: a })}
              className={cn(
                "size-7 rounded-full transition-transform duration-150 ease-out active:scale-90",
                tokens.accent === a ? "ring-2 ring-offset-2 ring-offset-card" : "ring-1 ring-border",
              )}
              style={{ background: a, ...(tokens.accent === a ? { boxShadow: `0 0 0 2px ${a}` } : {}) }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Corner radius</p>
        <div className="inline-flex w-full rounded-lg bg-muted p-0.5">
          {RADII.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={tokens.radius === o.value}
              onClick={() => onChange({ radius: o.value })}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-[color,background-color] duration-150 ease-out",
                tokens.radius === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <Seg<Density>
        label="Density"
        value={tokens.density}
        onChange={(v) => onChange({ density: v })}
        options={[
          { value: "spacious", label: "Spacious" },
          { value: "comfortable", label: "Comfort" },
          { value: "compact", label: "Compact" },
        ]}
      />
      <Seg<Typography>
        label="Typography"
        value={tokens.typography}
        onChange={(v) => onChange({ typography: v })}
        options={[
          { value: "geometric", label: "Geometric" },
          { value: "humanist", label: "Humanist" },
          { value: "classic", label: "Classic" },
        ]}
      />
      <Seg<Motion>
        label="Motion"
        value={tokens.motion}
        onChange={(v) => onChange({ motion: v })}
        options={[
          { value: "subtle", label: "Subtle" },
          { value: "expressive", label: "Express" },
          { value: "none", label: "None" },
        ]}
      />
      <Seg<Theme>
        label="Theme"
        value={tokens.theme}
        onChange={(v) => onChange({ theme: v })}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
      <Seg
        label="Navigation"
        value={nav}
        onChange={onNav}
        options={[
          { value: "sidebar", label: "Sidebar" },
          { value: "topbar", label: "Top bar" },
        ]}
      />
      <Seg
        label="Accessibility target"
        value={a11y}
        onChange={onA11y}
        options={[
          { value: "AA", label: "WCAG AA" },
          { value: "AAA", label: "WCAG AAA" },
        ]}
      />
    </div>
  );
}
