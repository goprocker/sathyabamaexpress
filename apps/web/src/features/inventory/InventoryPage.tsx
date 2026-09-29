// Kitchen / Inventory (Design System §12)
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Search, ScanLine } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ErrorState,
  Input,
  ListSkeleton,
  StatusPill,
  type PillTone,
} from "@/components/ui/primitives";
import { useInventory } from "@/hooks/queries";
import { formatQuantity, isExpiringSoon, relativeDay } from "@/lib/format";
import type { InventoryItem, InventoryStatus } from "@/mocks/types";

type Filter = "all" | "attention";

function statusOf(i: InventoryItem): InventoryStatus {
  if (i.quantity <= 0) return "critical";
  if (i.quantity <= i.lowThreshold) return "low";
  if (isExpiringSoon(i.expiry)) return "expiring";
  return "available";
}

function statusPill(s: InventoryStatus): { tone: PillTone; label: string } {
  switch (s) {
    case "critical":
      return { tone: "danger", label: "Out" };
    case "low":
      return { tone: "warning", label: "Low" };
    case "expiring":
      return { tone: "warning", label: "Expiring" };
    default:
      return { tone: "neutral", label: "OK" };
  }
}

export function InventoryPage() {
  const { data, isPending, isError, refetch } = useInventory();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((i) => {
      const matchesQ = q === "" || i.name.toLowerCase().includes(q);
      const needsAttention =
        i.quantity <= i.lowThreshold || isExpiringSoon(i.expiry);
      const matchesFilter = filter === "all" || needsAttention;
      return matchesQ && matchesFilter;
    });
  }, [data, search, filter]);

  const needsAttentionCount = (data ?? []).filter(
    (i) => i.quantity <= i.lowThreshold || isExpiringSoon(i.expiry),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kitchen"
        subtitle={data ? `${data.length} items in canonical ledger` : undefined}
        action={
          <button
            onClick={() => void navigate({ to: "/receipt" })}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-button border border-border bg-surface px-4 text-small font-medium transition-colors duration-150 hover:border-border-strong hover:bg-surface-subtle"
          >
            <Plus size={16} strokeWidth={1.75} />
            Add
          </button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search inventory"
            aria-label="Search inventory"
            className="pl-9"
          />
        </div>
        <div role="tablist" aria-label="Filter" className="flex gap-1.5">
          {(["all", "attention"] as const).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`h-10 cursor-pointer rounded-button border px-4 text-small transition-colors duration-150 ${
                filter === f
                  ? "border-accent/30 bg-accent-subtle font-medium text-accent"
                  : "border-border bg-surface text-text-secondary hover:border-border-strong"
              }`}
            >
              {f === "all"
                ? "All items"
                : `Needs attention (${needsAttentionCount})`}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <ListSkeleton rows={8} />
      ) : filtered.length === 0 ? (
        data && data.length > 0 ? (
          <p className="py-8 text-center text-small text-text-tertiary">
            Nothing matches your search.
          </p>
        ) : (
          <div className="rounded-card border border-dashed border-border-strong px-6 py-10 text-center">
            <p className="body-text">No inventory yet.</p>
            <p className="mt-1 text-small text-text-tertiary">
              Upload your first grocery receipt.
            </p>
            <button
              onClick={() => void navigate({ to: "/receipt" })}
              className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-button bg-accent px-4 text-small font-medium text-white transition-colors duration-150 hover:bg-accent/90"
            >
              <ScanLine size={16} strokeWidth={1.75} />
              Upload receipt
            </button>
          </div>
        )
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((item) => {
            const s = statusOf(item);
            const pill = statusPill(s);
            const reserved = item.reservedQuantity ?? 0;
            const incoming = item.incomingQuantity ?? 0;
            return (
              <Link
                key={item.id}
                to="/inventory/$itemId"
                params={{ itemId: item.id }}
                className="-mx-2 flex items-center justify-between gap-4 rounded-[6px] px-2 py-3 transition-colors duration-150 hover:bg-surface-subtle"
              >
                <div className="min-w-0">
                  <p className="body-text font-medium">{item.name}</p>
                  <p className="text-meta">
                    {item.category} · updated{" "}
                    {item.history[0]?.date ? relativeDay(item.history[0].date) : "—"}
                    {reserved > 0 && (
                      <span className="ml-2 text-warning">
                        · {formatQuantity(reserved, item.unit)} reserved
                      </span>
                    )}
                    {incoming > 0 && (
                      <span className="ml-2 text-accent">
                        · +{formatQuantity(incoming, item.unit)} incoming
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-small text-text-secondary tabular-nums">
                    {formatQuantity(item.quantity, item.unit)}
                  </span>
                  <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

