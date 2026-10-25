import { Skeleton } from "@/components/ui/skeleton";

/** Card-shaped placeholders mirroring the job/freelancer row anatomy. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 py-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-56" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="flex gap-1.5">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
