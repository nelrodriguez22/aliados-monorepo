import { Card } from "@/shared/components/ui/Card";
import { Skeleton } from "@/shared/components/ui/Skeleton";

/**
 * Placeholder de una TrabajoCard mientras carga. Imita su layout (avatar | texto | badge) para
 * que la lista no salte cuando llegan los datos.
 */
export function SkeletonCard() {
  return (
    <Card>
      <div className="flex items-center gap-2 min-[375px]:gap-3">
        <Skeleton className="h-9 w-9 min-[375px]:h-11 min-[375px]:w-11 shrink-0 rounded-xl!" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="shrink-0 space-y-1.5 flex flex-col items-end">
          <Skeleton className="h-6 w-20 rounded-full!" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </Card>
  );
}
