import { cn } from "@/lib/utils";
import { LAYER_TIER, type ILayer, type ITopology } from "@/lib/journey/topology";

const W = 640;
const NODE_W = 118;
const NODE_H = 40;
const ROW_H = 92;
const PAD_Y = 24;

interface Placed {
  layer: ILayer;
  x: number;
  y: number;
}

function place(topology: ITopology): { nodes: Placed[]; height: number } {
  const byTier = new Map<number, ILayer[]>();
  for (const l of topology.layers) {
    const t = LAYER_TIER[l.type];
    const arr = byTier.get(t) ?? [];
    arr.push(l);
    byTier.set(t, arr);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const nodes: Placed[] = [];
  tiers.forEach((tier, row) => {
    const layers = byTier.get(tier)!;
    layers.forEach((layer, i) => {
      const x = ((i + 1) * W) / (layers.length + 1) - NODE_W / 2;
      const y = row * ROW_H + PAD_Y;
      nodes.push({ layer, x, y });
    });
  });
  return { nodes, height: tiers.length * ROW_H + PAD_Y };
}

/** Synchronized visual topology — nodes auto-laid by tier, click to select. */
export function TopologyCanvas({
  topology,
  selectedId,
  onSelect,
}: {
  topology: ITopology;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { nodes, height } = place(topology);
  const center = new Map(nodes.map((n) => [n.layer.id, { x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 }]));

  return (
    <div className="overflow-x-auto rounded-xl border bg-card p-3">
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full min-w-[520px]" role="img" aria-label="Solution topology diagram">
        <defs>
          <marker id="topo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/60" />
          </marker>
        </defs>
        {topology.dependencies.map((d) => {
          const a = center.get(d.from);
          const b = center.get(d.to);
          if (!a || !b) return null;
          return (
            <line
              key={`${d.from}-${d.to}`}
              x1={a.x}
              y1={a.y + NODE_H / 2 - 2}
              x2={b.x}
              y2={b.y - NODE_H / 2 + 2}
              className="stroke-muted-foreground/40"
              strokeWidth={1.5}
              markerEnd="url(#topo-arrow)"
            />
          );
        })}
        {nodes.map(({ layer, x, y }) => {
          const active = layer.id === selectedId;
          return (
            <g key={layer.id} onClick={() => onSelect(layer.id)} className="cursor-pointer">
              <rect
                x={x}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                className={cn(
                  "transition-colors",
                  active ? "fill-primary/15 stroke-primary" : "fill-muted stroke-border hover:fill-muted/70",
                )}
                strokeWidth={active ? 2 : 1}
              />
              <text x={x + NODE_W / 2} y={y + NODE_H / 2 + 4} textAnchor="middle" className={cn("text-[11px] font-medium", active ? "fill-primary" : "fill-foreground")}>
                {layer.name.length > 16 ? `${layer.name.slice(0, 15)}…` : layer.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
