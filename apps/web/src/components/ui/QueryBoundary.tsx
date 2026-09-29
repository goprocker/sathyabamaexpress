import type { ReactNode } from "react";
import { ErrorState, Skeleton } from "@/components/ui/primitives";

/** Loading, error and data states for a query-backed screen. */
export interface QueryLike<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
  refetch: () => unknown;
}

export function QueryBoundary<T>({
  query,
  children,
  rows = 3,
}: {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  rows?: number;
}) {
  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading" className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full !rounded-[32px]" />
        ))}
      </div>
    );
  }
  if (query.isError || query.data === undefined) {
    return <ErrorState message="Couldn't load this right now." onRetry={() => void query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}
