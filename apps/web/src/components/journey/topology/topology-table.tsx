import { cn } from "@/lib/utils";
import { LAYER_TYPE_LABEL, type ITopology } from "@/lib/journey/topology";

const MATURITY_CHIP: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  building: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  live: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

/** Authoritative accessible layer table — synchronized with the canvas selection. */
export function TopologyTable({
  topology,
  selectedId,
  onSelect,
}: {
  topology: ITopology;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Layer</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Owner</th>
            <th className="px-3 py-2 font-medium">Repository</th>
            <th className="px-3 py-2 font-medium">Maturity</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {topology.layers.map((l) => {
            const active = l.id === selectedId;
            return (
              <tr
                key={l.id}
                onClick={() => onSelect(l.id)}
                aria-selected={active}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(l.id);
                  }
                }}
                className={cn("cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none", active && "bg-muted")}
              >
                <td className="px-3 py-2 font-medium text-foreground">{l.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{LAYER_TYPE_LABEL[l.type]}</td>
                <td className="px-3 py-2">
                  {l.owner ? (
                    <span className="text-muted-foreground">{l.owner}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Unassigned
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.repo}</td>
                <td className="px-3 py-2">
                  <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-medium capitalize", MATURITY_CHIP[l.maturity])}>
                    {l.maturity}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
