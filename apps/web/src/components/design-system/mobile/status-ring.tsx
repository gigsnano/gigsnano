import { ios } from "./ios-css";
import { STATUS_LABEL, type TDemoStatus } from "./demo-data";

const FILL: Record<TDemoStatus, number> = { backlog: 0, todo: 0, in_progress: 0.5, review: 0.75, done: 1 };

interface IStatusRingProps {
  status: TDemoStatus;
  /** Project tint (CSS colour). */
  color: string;
  size?: number;
  onToggle?: () => void;
}

/**
 * Reminders' completion circle, extended for workflow states:
 * dashed = backlog · ring = to do · pie = progress · filled check = done.
 * The ring always wears the project tint so lists read at a glance.
 */
export function StatusRing({ status, color, size = 22, onToggle }: IStatusRingProps) {
  const done = status === "done";
  const r = 9;
  const pieR = 3.75;
  const pieC = 2 * Math.PI * pieR;
  const ringColor = status === "backlog" ? ios("label-tertiary") : color;

  const glyph = (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
      <circle
        cx="11" cy="11" r={r} fill="none" stroke={ringColor} strokeWidth="1.5"
        strokeDasharray={status === "backlog" ? "2.4 2.4" : undefined}
      />
      <circle
        cx="11" cy="11" r={pieR} fill="none" stroke={color} strokeWidth={pieR * 2}
        strokeDasharray={`${FILL[status] * pieC} ${pieC}`} transform="rotate(-90 11 11)"
        style={{ transition: "stroke-dasharray 220ms cubic-bezier(0.23, 1, 0.32, 1)" }}
      />
      <g
        style={{
          transformOrigin: "11px 11px",
          transform: done ? "scale(1)" : "scale(0.6)",
          opacity: done ? 1 : 0,
          transition: "transform 220ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease-out",
        }}
      >
        <circle cx="11" cy="11" r="10" fill={color} />
        <path d="M6.6 11.2l3 3 5.8-6.2" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );

  if (!onToggle) return glyph;
  return (
    <button
      type="button"
      aria-label={done ? "Mark not done" : "Mark done"}
      aria-pressed={done}
      title={STATUS_LABEL[status]}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onToggle}
      className="-m-2.5 grid shrink-0 place-items-center p-2.5 transition-transform duration-100 ease-out active:scale-90"
    >
      {glyph}
    </button>
  );
}
