import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  ChefHat,
  Clock,
  Mic,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { useDashboard, useInventory, useForecasts } from "@/hooks/queries";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { useKitchenSample, type KitchenSample } from "@/hooks/life";

type StockFilter = "all" | "low" | "expiring";

const filters: { id: StockFilter; label: string }[] = [
  { id: "all", label: "Attention" },
  { id: "low", label: "Running low" },
  { id: "expiring", label: "Expiring" },
];

function QuickAction({
  to,
  icon: Icon,
  title,
  hint,
  tint,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  hint: string;
  tint: string;
}) {
  return (
    <Link
      to={to}
      className="card-interactive group flex min-h-[176px] flex-col justify-between p-5"
    >
      <div className="flex items-start justify-between">
        <span className={`flex size-12 items-center justify-center rounded-[16px] ${tint}`}>
          <Icon size={20} strokeWidth={1.5} />
        </span>
        <ArrowUpRight
          size={18}
          strokeWidth={1.5}
          className="text-text-tertiary transition-transform duration-[180ms] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary"
        />
      </div>
      <div>
        <p className="text-[22px] leading-tight tracking-[-0.03em]">{title}</p>
        <p className="mt-1 text-[14px] text-text-secondary">{hint}</p>
      </div>
    </Link>
  );
}

export function DashboardPage() {
  const sample = useKitchenSample();
  return <QueryBoundary query={sample}>{(data) => <KitchenView sample={data} />}</QueryBoundary>;
}

function KitchenView({ sample }: { sample: KitchenSample }) {
  const { cart: smartCart, budget: budgetData, days: weeklyMealPlan } = sample;
  const { data: dash, isLoading: dashLoading } = useDashboard();
  const { data: inv } = useInventory();
  const { data: forecasts } = useForecasts();
  const [filter, setFilter] = useState<StockFilter>("all");
  const [activeMeal, setActiveMeal] = useState<string | null>(null);

  const inventoryItems = inv ?? [];
  const lowItems = inventoryItems.filter((i) => i.daysRemaining != null && i.daysRemaining <= 3);
  const expiringItems = inventoryItems.filter((i) => i.daysRemaining != null && i.daysRemaining <= 2);
  const todayMeals = weeklyMealPlan.find((d) => d.isToday);
  const cartTotal = smartCart.reduce((s, c) => s + c.estimatedPrice, 0);
  const highForecasts = (forecasts ?? []).filter((f) => f.severity === "high");

  const shown = filter === "expiring" ? expiringItems : lowItems;
  const counts: Record<StockFilter, number> = {
    all: lowItems.length,
    low: lowItems.length,
    expiring: expiringItems.length,
  };
  const spentPct = Math.min(100, (budgetData.spent / budgetData.monthlyBudget) * 100);

  return (
    <div className="space-y-20">
      {/* Hero */}
      <header className="fade-in-up stagger-1">
        <div className="mb-5 flex items-center gap-3">
          <img src="/brand/logo-mark.png" alt="" width={44} height={44} className="size-11 object-contain" />
          <p className="eyebrow">SmartKitchen AI · a LIVORA module</p>
        </div>
        <h1 className="hero-title max-w-[12ch]">Your kitchen, understood</h1>
        <p className="mt-6 max-w-[40ch] text-[clamp(18px,2.2vw,24px)] leading-snug tracking-[-0.02em]">
          Your kitchen is 85% stocked. {lowItems.length} items need attention.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/receipt" className="btn-primary min-h-[52px]" style={{ borderRadius: 999 }}>
            <Camera size={18} strokeWidth={1.5} />
            Scan grocery
          </Link>
          <Link to="/voice" className="btn-secondary min-h-[52px]" style={{ borderRadius: 999 }}>
            <Mic size={18} strokeWidth={1.5} />
            Plan by voice
          </Link>
        </div>
      </header>

      {/* Quick actions */}
      <section aria-labelledby="quick-title" className="fade-in-up stagger-2">
        <p id="quick-title" className="eyebrow mb-4">
          Start here
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction to="/receipt" icon={Camera} title="Scan grocery" hint="Receipt or items" tint="bg-accent-subtle text-accent" />
          <QuickAction to="/voice" icon={Mic} title="Voice command" hint="Plan a meal" tint="bg-tint-sky-subtle text-tint-sky" />
          <QuickAction to="/recipes" icon={Sparkles} title="Recipes" hint="From your pantry" tint="bg-gold-subtle text-warning" />
          <QuickAction
            to="/cart"
            icon={ShoppingCart}
            title="Smart cart"
            hint={`${smartCart.length} items · ₹${cartTotal}`}
            tint="bg-tint-coral-subtle text-tint-coral"
          />
        </div>
      </section>

      {/* Kitchen status + today's meals */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="card-base space-y-5 p-5 fade-in-up stagger-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Kitchen status</h2>
            <Link
              to="/inventory"
              className="flex items-center gap-1 text-[14px] text-text-secondary transition-colors hover:text-text-primary"
            >
              Pantry <ArrowRight size={14} strokeWidth={1.5} />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Total items", value: dashLoading ? "–" : (dash?.inventorySummary.total ?? 42), cls: "bg-accent-subtle text-accent" },
              { label: "Running low", value: lowItems.length, cls: "bg-warning-bg text-warning" },
              { label: "Expiring", value: expiringItems.length, cls: "bg-danger-bg text-danger" },
            ].map((s) => (
              <div key={s.label} className={`rounded-[16px] p-4 ${s.cls}`}>
                <p className="text-[34px] leading-none tracking-[-0.04em]">{s.value}</p>
                <p className="mt-2 text-[12px] opacity-75">{s.label}</p>
              </div>
            ))}
          </div>

          <div role="tablist" aria-label="Stock filter" className="inline-flex rounded-full bg-surface-elevated p-1">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`min-h-[36px] rounded-full px-3.5 text-[14px] transition-colors duration-[180ms] ${
                  filter === f.id ? "bg-accent text-accent-text" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {f.label}
                <span className="ml-1.5 opacity-60">{counts[f.id]}</span>
              </button>
            ))}
          </div>

          <ul className="space-y-2" role="tabpanel">
            {shown.slice(0, 4).map((item) => (
              <li key={item.id}>
                <Link
                  to="/inventory/$itemId"
                  params={{ itemId: item.id }}
                  className="flex items-center justify-between rounded-[16px] bg-surface-elevated px-4 py-3 transition-transform duration-[180ms] hover:-translate-y-0.5"
                >
                  <span>
                    <span className="block text-[16px] leading-tight tracking-[-0.02em]">{item.name}</span>
                    <span className="block text-[13px] text-text-tertiary">
                      {item.quantity} {item.unit} left
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[12px] ${
                      (item.daysRemaining ?? 99) <= 1
                        ? "bg-danger-bg text-danger"
                        : "bg-warning-bg text-warning"
                    }`}
                  >
                    {item.daysRemaining}d left
                  </span>
                </Link>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="rounded-[16px] bg-surface-elevated px-4 py-6 text-center text-[14px] text-text-secondary">
                Nothing here. Your pantry is in good shape.
              </li>
            )}
          </ul>
        </div>

        {/* Today's meals: dark timeline panel */}
        <div className="panel-dark flex flex-col p-5 fade-in-up stagger-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[26px] leading-tight tracking-[-0.03em]">Today's meals</h2>
            <Link
              to="/meals"
              className="flex items-center gap-1 text-[14px] text-panel-muted transition-colors hover:text-panel-text"
            >
              Full plan <ArrowRight size={14} strokeWidth={1.5} />
            </Link>
          </div>

          {todayMeals ? (
            <>
              <ul className="mt-6 space-y-2">
                {todayMeals.meals.map((meal) => {
                  const open = activeMeal === meal.id;
                  return (
                    <li key={meal.id}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setActiveMeal(open ? null : meal.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-[16px] px-4 py-3.5 text-left transition-colors duration-[180ms] ${
                          open ? "bg-white/20" : "bg-white/10 hover:bg-white/15"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="mono-label block !text-panel-muted">{meal.slot}</span>
                          <span className="block truncate text-[18px] leading-tight tracking-[-0.02em]">
                            {meal.recipeName}
                          </span>
                        </span>
                        <span
                          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] ${
                            meal.status === "completed"
                              ? "bg-panel-text text-panel"
                              : "bg-white/15 text-panel-muted"
                          }`}
                        >
                          {meal.status === "completed" && <Check size={12} strokeWidth={2} />}
                          {meal.status === "completed" ? "Done" : meal.status === "confirmed" ? "Ready" : "Planned"}
                        </span>
                      </button>
                      {open && (
                        <div
                          className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[16px] bg-white/10 px-4 py-3 text-[14px] text-panel-muted"
                          style={{ animation: "fadeIn 220ms var(--ease-out) both" }}
                        >
                          <span>{meal.servings} servings</span>
                          {meal.prepTime && (
                            <span className="flex items-center gap-1.5">
                              <Clock size={13} strokeWidth={1.5} />
                              {meal.prepTime} min prep
                            </span>
                          )}
                          <Link to="/recipes" className="ml-auto flex items-center gap-1 text-panel-text">
                            Open recipe <ArrowUpRight size={14} strokeWidth={1.5} />
                          </Link>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {todayMeals.cookingTimeAvailable && (
                <p className="mt-auto flex items-center gap-2 pt-6 text-[14px] text-panel-muted">
                  <Clock size={14} strokeWidth={1.5} />
                  <span>
                    <span className="text-panel-text">{todayMeals.cookingTimeAvailable} min</span> cooking time available
                    today
                  </span>
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              <ChefHat size={32} strokeWidth={1.25} className="mb-3 text-panel-muted" />
              <p className="text-[15px] text-panel-muted">No meals planned for today</p>
              <Link
                to="/meals"
                className="mt-4 inline-flex h-11 items-center rounded-[14px] bg-panel-text px-5 text-[15px] text-panel"
              >
                Plan today
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Budget + predictions */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="card-base space-y-6 p-5 fade-in-up stagger-5">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Monthly budget</h2>
            <span className="mono-label">September 2026</span>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[56px] leading-none tracking-[-0.05em]">₹{budgetData.spent.toLocaleString()}</p>
              <p className="mt-2 text-[14px] text-text-secondary">
                of ₹{budgetData.monthlyBudget.toLocaleString()}
              </p>
            </div>
            <p className="rounded-full bg-surface-elevated px-3 py-1 text-[14px]">
              ₹{budgetData.remaining.toLocaleString()} left
            </p>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(spentPct)}
            aria-label="Budget spent"
            className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-tint-teal transition-all duration-700"
              style={{ width: `${spentPct}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {budgetData.weeklyBreakdown.map((w, i) => (
              <div key={w.week}>
                <div className="relative mb-1.5 h-16 overflow-hidden rounded-[12px] bg-surface-elevated">
                  <div
                    className="absolute bottom-0 w-full rounded-[12px] bg-gradient-to-t from-accent to-[#7FB56A] transition-all duration-500"
                    style={{
                      height: `${Math.min(100, (w.spent / w.budget) * 100)}%`,
                      opacity: i === 3 ? 0.25 : 0.9,
                    }}
                  />
                </div>
                <p className="mono-label text-center">W{i + 1}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card-base space-y-5 p-5 fade-in-up stagger-6">
          <div className="flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <TrendingDown size={20} strokeWidth={1.5} />
              Predictions
            </h2>
            <Link
              to="/forecasts"
              className="flex items-center gap-1 text-[14px] text-text-secondary transition-colors hover:text-text-primary"
            >
              All forecasts <ArrowRight size={14} strokeWidth={1.5} />
            </Link>
          </div>
          <ul className="space-y-2">
            {highForecasts.slice(0, 3).map((f) => (
              <li key={f.id} className="flex items-start gap-3 rounded-[16px] bg-surface-elevated px-4 py-3.5">
                <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-danger" />
                <div className="min-w-0">
                  <p className="text-[16px] leading-tight tracking-[-0.02em]">{f.itemName}</p>
                  <p className="mt-0.5 text-[14px] text-text-secondary">{f.detail}</p>
                </div>
              </li>
            ))}
            {highForecasts.length === 0 && (
              <li className="rounded-[16px] bg-surface-elevated px-4 py-8 text-center text-[14px] text-text-secondary">
                No urgent predictions
              </li>
            )}
          </ul>
        </div>
      </section>

      {/* Attention */}
      {dash && dash.attentionItems.length > 0 && (
        <section className="card-base space-y-3 p-5 fade-in-up">
          <h2 className="section-title flex items-center gap-2">
            <AlertTriangle size={20} strokeWidth={1.5} />
            Needs your attention
          </h2>
          <ul className="space-y-1.5">
            {dash.attentionItems.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="group flex items-center justify-between rounded-[16px] px-4 py-3.5 transition-colors duration-[180ms] hover:bg-surface-elevated"
                >
                  <span>
                    <span className="block text-[16px] leading-tight tracking-[-0.02em]">{item.title}</span>
                    <span className="block text-[14px] text-text-secondary">{item.description}</span>
                  </span>
                  <ArrowRight
                    size={16}
                    strokeWidth={1.5}
                    className="text-text-tertiary transition-transform duration-[180ms] group-hover:translate-x-1 group-hover:text-text-primary"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
