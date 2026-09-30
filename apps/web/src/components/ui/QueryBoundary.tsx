import type { ReactNode } from "react";
import { Button, ErrorState, Skeleton } from "@/components/ui/primitives";
import { useAccount } from "@/lib/auth";

/** Loading, error and data states for a query-backed screen. */
export interface QueryLike<T> {
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
  refetch: () => unknown;
  error?: unknown;
}

/** Turns a failed request into something a person can act on. */
function describe(error: unknown): { message: string; signedOut: boolean } {
  const status = (error as { status?: number } | null)?.status;
  const text = error instanceof Error ? error.message : "";
  if (status === 401) {
    return { message: "The server didn't accept your sign-in. Sign out and sign in again.", signedOut: true };
  }
  if (status === 503) return { message: text || "The server is busy. Try again in a moment.", signedOut: false };
  if (status && status >= 500) return { message: `${text || "The server had a problem."} (error ${status})`, signedOut: false };
  return { message: text || "Couldn't load this right now.", signedOut: false };
}

function FailedQuery({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const account = useAccount();
  const { message, signedOut } = describe(error);
  return (
    <ErrorState message={message} onRetry={onRetry}>
      {signedOut && account.enabled && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => void account.signOut()}>
          Sign out
        </Button>
      )}
    </ErrorState>
  );
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
    return <FailedQuery error={query.error} onRetry={() => void query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}
