import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Search,
  SlidersHorizontal,
  Clock,
  Plus,
  Package,
} from "lucide-react";
import { useInventory } from "@/hooks/queries";
import { inventory as seedInventory } from "@/mocks/data";
import type { InventoryItem, InventoryStatus } from "@/mocks/types";

type CategoryFilter = "all" | string;
type StatusFilter = "all" | "low" | "expiring" | "available";

function getStatus(item: InventoryItem): InventoryStatus {
  if (item.daysRemaining != null && item.daysRemaining <= 1) return "critical";
  if (item.quantity <= item.lowThreshold) return "critical";
  if (item.daysRemaining != null && item.daysRemaining <= 3) return "expiring";
  if (item.quantity < item.lowThreshold * 2) return "low";
  return "available";
}

function statusLabel(s: InventoryStatus) {
  switch (s) {
    case "critical": return { text: "Critical", cls: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]" };
    case "expiring": return { text: "Expiring", cls: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]" };
    case "low": return { text: "Low", cls: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]" };
    case "available": return { text: "Good", cls: "bg-[var(--color-success-bg)] text-[var(--color-success)]" };
  }
}

function StockBar({ item }: { item: InventoryItem }) {
  const maxDays = 21;
  const days = item.daysRemaining ?? Math.round(item.quantity / (item.dailyConsumption || 0.1));
  const pct = Math.min(100, (days / maxDays) * 100);
  const color =
    days <= 2 ? "var(--color-danger)" :
    days <= 5 ? "var(--color-warning)" :
    "var(--color-accent)";

  return (
    <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-subtle)] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function PantryPage() {
  const { data: inv, isLoading } = useInventory();
  const items = inv ?? seedInventory;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  const categories = ["all", ...new Set(items.map((i) => i.category))];

  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (statusFilter !== "all") {
      const s = getStatus(item);
      if (statusFilter === "low" && s !== "low" && s !== "critical") return false;
      if (statusFilter === "expiring" && s !== "expiring") return false;
      if (statusFilter === "available" && s !== "available") return false;
    }
    return true;
  });

  const totalValue = items.reduce((s, i) => s + (i.price ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="fade-in-up stagger-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">My Pantry</h1>
            <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">
              {items.length} items · ≈₹{totalValue.toLocaleString()} value
            </p>
          </div>
          <Link
            to="/receipt"
            className="btn-primary text-[13px] gap-1.5"
          >
            <Plus size={16} />
            Add Items
          </Link>
        </div>
      </header>

      {/* Search + Filter */}
      <div className="flex gap-2 fade-in-up stagger-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="Search pantry..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-9 pr-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[14px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:ring-0 outline-none transition-colors duration-[150ms]"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary h-11 w-11 p-0 shrink-0 ${showFilters ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)]" : ""}`}
          aria-label="Toggle filters"
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      {/* Filter pills */}
      {showFilters && (
        <div className="space-y-3 fade-in-up">
          <div>
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] tracking-[0.06em] uppercase mb-2">Category</p>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-[150ms] ${
                    categoryFilter === cat
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                  }`}
                >
                  {cat === "all" ? "All" : cat}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] tracking-[0.06em] uppercase mb-2">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "low", "expiring", "available"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-[150ms] ${
                    statusFilter === s
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                  }`}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Inventory Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-base p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[8px] skeleton" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 skeleton" />
                  <div className="h-3 w-16 skeleton" />
                </div>
              </div>
              <div className="h-1.5 skeleton" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package size={40} className="text-[var(--color-text-tertiary)] mb-3" strokeWidth={1.25} />
          <p className="text-[15px] font-medium text-[var(--color-text-secondary)]">No items found</p>
          <p className="text-[13px] text-[var(--color-text-tertiary)] mt-1">Try a different search or filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 fade-in-up stagger-3">
          {filtered.map((item) => {
            const status = getStatus(item);
            const { text, cls } = statusLabel(status);
            const days = item.daysRemaining ?? Math.round(item.quantity / (item.dailyConsumption || 0.1));

            return (
              <Link
                key={item.id}
                to="/inventory/$itemId"
                params={{ itemId: item.id }}
                className="card-interactive p-4 space-y-3 block"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[10px] bg-[var(--color-surface-subtle)] flex items-center justify-center text-[18px]">
                      {item.emoji ?? "📦"}
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{item.name}</p>
                      <p className="text-[12px] text-[var(--color-text-tertiary)]">{item.category}</p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
                    {text}
                  </span>
                </div>

                <StockBar item={item} />

                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[var(--color-text-secondary)]">
                    {item.quantity} {item.unit}
                  </span>
                  <span className="flex items-center gap-1 text-[var(--color-text-tertiary)]">
                    <Clock size={11} />
                    ~{days}d
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
