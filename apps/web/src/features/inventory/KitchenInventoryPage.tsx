import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Camera, ChefHat, Clock, Package, Receipt, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useInventory } from "@/hooks/queries";
import { useRecentReceipts, useRecipeCatalog } from "@/hooks/life";
import type { InventoryItem, InventoryStatus } from "@/mocks/types";

type StatusFilter = "all" | "low" | "expiring" | "available";

function getStatus(item: InventoryItem): InventoryStatus {
  if (item.daysRemaining != null && item.daysRemaining <= 1) return "critical";
  if (item.quantity <= item.lowThreshold) return "critical";
  if (item.daysRemaining != null && item.daysRemaining <= 3) return "expiring";
  if (item.quantity < item.lowThreshold * 2) return "low";
  return "available";
}

const STATUS_STYLE: Record<InventoryStatus, { text: string; cls: string }> = {
  critical: { text: "Critical", cls: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]" },
  expiring: { text: "Expiring", cls: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]" },
  low: { text: "Low", cls: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]" },
  available: { text: "Good", cls: "bg-[var(--color-success-bg)] text-[var(--color-success)]" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-[36px] rounded-full px-3.5 text-[13px] font-medium transition-colors duration-[150ms] ${
        active
          ? "bg-[var(--color-accent)] text-white"
          : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
      }`}
    >
      {children}
    </button>
  );
}

export function KitchenInventoryPage() {
  const { data: items, isLoading, isError, refetch } = useInventory();
  const { data: receipts } = useRecentReceipts();
  const { data: recipes } = useRecipeCatalog(4);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const all = items ?? [];
  const counts = useMemo(() => {
    let low = 0;
    let expiring = 0;
    for (const i of all) {
      const s = getStatus(i);
      if (s === "low" || s === "critical") low += 1;
      if (s === "expiring") expiring += 1;
    }
    return { low, expiring };
  }, [all]);

  const filtered = all.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (status === "all") return true;
    const s = getStatus(item);
    if (status === "low") return s === "low" || s === "critical";
    return s === status;
  });

  const cookable = (recipes ?? []).filter((r) => r.canMakeNow).slice(0, 6);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Kitchen"
        title="Inventory"
        subtitle={
          items
            ? `${all.length} items in stock. Stock updates when you confirm a scanned bill or cook a recipe.`
            : "Everything in your kitchen, kept up to date from your bills."
        }
        action={
          <Link to="/receipt" className="btn-primary min-h-[48px] gap-2" style={{ borderRadius: 999 }}>
            <Camera size={18} strokeWidth={1.75} />
            Scan bill
          </Link>
        }
      />

      {items && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Items", value: all.length },
            { label: "Running low", value: counts.low },
            { label: "Expiring soon", value: counts.expiring },
          ].map((s) => (
            <div key={s.label} className="card-base p-4">
              <p className="text-[24px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">{s.value}</p>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <section aria-labelledby="bills-h" className="space-y-3">
        <h2 id="bills-h" className="eyebrow">Added from your bills</h2>
        {receipts && receipts.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {receipts.map((r) => (
              <li key={r.id} className="card-base space-y-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-[14px] font-medium text-[var(--color-text-primary)]">
                    <Receipt size={16} strokeWidth={1.5} className="text-[var(--color-accent)]" />
                    {r.vendor}
                  </p>
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">{formatDate(r.date)}</span>
                </div>
                <p className="text-[13px] text-[var(--color-text-secondary)]">
                  {r.items.slice(0, 4).map((i) => `${i.name} ${i.quantity} ${i.unit}`).join(" · ")}
                  {r.items.length > 4 && ` · +${r.items.length - 4} more`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card-base flex items-center gap-4 p-5">
            <Receipt size={22} strokeWidth={1.5} className="shrink-0 text-[var(--color-text-tertiary)]" />
            <p className="text-[14px] text-[var(--color-text-secondary)]">
              No bills scanned yet. Scan a grocery bill and confirm it, and each item lands here with its quantity and
              expiry.
            </p>
          </div>
        )}
      </section>

      {cookable.length > 0 && (
        <section aria-labelledby="cook-h" className="space-y-3">
          <h2 id="cook-h" className="eyebrow">You can cook now</h2>
          <ul className="flex flex-wrap gap-2">
            {cookable.map((r) => (
              <li key={r.id}>
                <Link
                  to="/recipes"
                  search={{ open: r.id }}
                  className="flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--color-accent-subtle)] px-4 text-[14px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-border)]"
                >
                  <ChefHat size={15} strokeWidth={1.75} />
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="stock-h" className="space-y-4">
        <h2 id="stock-h" className="eyebrow">In stock</h2>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <label htmlFor="inv-search" className="sr-only">Search inventory</label>
          <input
            id="inv-search"
            type="search"
            placeholder="Search inventory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-4 text-[14px] text-[var(--color-text-primary)] outline-none transition-colors duration-[150ms] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
          {(["all", "low", "expiring", "available"] as StatusFilter[]).map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {s === "all" ? "All" : s === "available" ? "Good" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Chip>
          ))}
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading inventory">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-[12px] bg-[var(--color-surface-subtle)]" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle size={32} strokeWidth={1.25} className="text-[var(--color-text-tertiary)]" />
            <p className="text-[15px] font-medium text-[var(--color-text-secondary)]">Couldn't load inventory</p>
            <button type="button" onClick={() => void refetch()} className="btn-secondary">Try again</button>
          </div>
        )}

        {items && filtered.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <Package size={40} strokeWidth={1.25} className="mb-3 text-[var(--color-text-tertiary)]" />
            <p className="text-[15px] font-medium text-[var(--color-text-secondary)]">
              {all.length === 0 ? "Inventory is empty" : "No items match"}
            </p>
            <p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">
              {all.length === 0 ? "Scan a bill to add your first items." : "Try a different search or filter."}
            </p>
          </div>
        )}

        {items && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const st = STATUS_STYLE[getStatus(item)];
              const days = item.daysRemaining ?? null;
              return (
                <Link
                  key={item.id}
                  to="/inventory/$itemId"
                  params={{ itemId: item.id }}
                  className="card-interactive block space-y-2 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[var(--color-text-primary)]">{item.name}</p>
                      <p className="text-[12px] text-[var(--color-text-tertiary)]">{item.category}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.text}</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-[var(--color-text-secondary)]">{item.formattedOnHand ?? `${item.quantity} ${item.unit}`}</span>
                    {days != null && (
                      <span className="flex items-center gap-1 text-[12px] text-[var(--color-text-tertiary)]">
                        <Clock size={11} /> ~{days}d
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
