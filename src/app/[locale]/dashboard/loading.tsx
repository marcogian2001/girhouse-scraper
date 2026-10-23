import { TableFrame } from '@/components/TableFrame';
import { Skeleton } from '@/components/ui/skeleton';

const SKELETON_ROWS = 8;

/**
 * Shown while a dashboard page streams in, shaped like the usual header, toolbar and table,
 * so navigation responds at once instead of waiting for the database.
 * @returns The page placeholder.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-9 w-32" />
      </div>

      <TableFrame>
        <div className="h-10 border-b bg-muted/60" />
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <div key={index} className="flex h-12 items-center gap-6 border-b px-3 last:border-0">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="ml-auto h-4 w-12" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </TableFrame>
    </div>
  );
}
