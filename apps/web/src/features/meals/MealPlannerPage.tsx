import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { authEnabled } from "@/lib/auth";
import {
  CalendarDays,
  Clock,
  ChevronRight,
  Plus,
  AlertCircle,
  Check,
  Sparkles,
} from "lucide-react";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { useKitchenSample, type KitchenSample } from "@/hooks/life";
import type { MealPlan, WeeklyMealPlan } from "@/mocks/types";

function SlotIcon({ slot }: { slot: string }) {
  const colors: Record<string, string> = {
    Breakfast: "bg-[#FFF8E1] text-[#F57F17]",
    Lunch: "bg-[#E8F5E9] text-[#2E7D32]",
    Dinner: "bg-[#EDE7F6] text-[#5E35B1]",
    Snack: "bg-[#FFF3E0] text-[#E65100]",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-[0.02em] ${colors[slot] ?? colors.Lunch}`}>
      {slot}
    </span>
  );
}

function MealCard({ meal }: { meal: MealPlan }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] px-3.5 py-3 transition-all duration-[180ms] hover:border-[var(--color-border-strong)] hover:translate-y-[-1px]">
      <span className="text-[22px]">{meal.emoji ?? "🍽️"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-[var(--color-text-primary)] truncate">
            {meal.recipeName}
          </p>
          <SlotIcon slot={meal.slot} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">
          <span>{meal.servings} servings</span>
          {meal.prepTime && (
            <span className="flex items-center gap-0.5">
              <Clock size={10} /> {meal.prepTime}m
            </span>
          )}
        </div>
      </div>
      <div>
        {meal.status === "completed" ? (
          <span className="w-6 h-6 rounded-full bg-[var(--color-success-bg)] flex items-center justify-center">
            <Check size={13} className="text-[var(--color-success)]" />
          </span>
        ) : meal.status === "confirmed" ? (
          <span className="w-6 h-6 rounded-full bg-[var(--color-info-subtle)] flex items-center justify-center">
            <Check size={13} className="text-[var(--color-info)]" />
          </span>
        ) : (
          <ChevronRight size={16} className="text-[var(--color-text-tertiary)]" />
        )}
      </div>
    </div>
  );
}

function DayColumn({ day }: { day: WeeklyMealPlan }) {
  const isToday = day.isToday;

  return (
    <div className={`space-y-2 ${isToday ? "" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <p className={`text-[14px] font-semibold tracking-[-0.01em] ${
            isToday ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]"
          }`}>
            {day.day}
          </p>
          {isToday && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-accent)] text-white">
              Today
            </span>
          )}
        </div>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          {day.date.split("-").reverse().slice(0, 2).join("/")}
        </span>
      </div>

      {day.cookingTimeAvailable && (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)] mb-1">
          <Clock size={11} />
          <span>{day.cookingTimeAvailable}m available</span>
          {day.cookingTimeAvailable <= 30 && (
            <span className="flex items-center gap-0.5 text-[var(--color-warning)]">
              <AlertCircle size={10} /> Limited time
            </span>
          )}
        </div>
      )}

      {day.meals.length > 0 ? (
        <div className="space-y-1.5">
          {day.meals.map((meal) => (
            <MealCard key={meal.id} meal={meal} />
          ))}
        </div>
      ) : (
        <div className="rounded-[10px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-subtle)]/50 px-4 py-6 text-center">
          <p className="text-[12px] text-[var(--color-text-tertiary)]">No meals planned</p>
          <button className="mt-2 text-[12px] font-medium text-[var(--color-accent)] flex items-center gap-1 mx-auto hover:gap-1.5 transition-all duration-[150ms]">
            <Plus size={13} /> Add meal
          </button>
        </div>
      )}
    </div>
  );
}

export function MealPlannerPage() {
  const sample = useKitchenSample();
  return <QueryBoundary query={sample}>{(data) => <MealPlannerView sample={data} />}</QueryBoundary>;
}

function MealPlannerView({ sample }: { sample: KitchenSample }) {
  const weeklyMealPlan = sample.days;
  const [view, setView] = useState<"week" | "day">("week");
  const totalMeals = weeklyMealPlan.reduce((s, d) => s + d.meals.length, 0);
  const completedMeals = weeklyMealPlan.reduce(
    (s, d) => s + d.meals.filter((m) => m.status === "completed").length,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="fade-in-up stagger-1">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={18} className="text-[var(--color-accent)]" />
              <h1 className="page-title">Meal Planner</h1>
            </div>
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              {completedMeals} of {totalMeals} meals completed this week
            </p>
          </div>
          <div className="flex gap-1 bg-[var(--color-surface-subtle)] rounded-[8px] p-0.5">
            <button
              onClick={() => setView("week")}
              className={`px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-all duration-[150ms] ${
                view === "week"
                  ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView("day")}
              className={`px-3 py-1.5 rounded-[6px] text-[12px] font-medium transition-all duration-[150ms] ${
                view === "day"
                  ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              Today
            </button>
          </div>
        </div>
      </header>

      {/* The suggestion below is a fixed sample; signed-in households get an empty-state prompt instead. */}
      {authEnabled ? (
        weeklyMealPlan.length === 0 && (
          <div className="card-base p-5 space-y-3 fade-in-up stagger-2">
            <p className="text-[14px] font-medium">No meals planned yet</p>
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              Say what you want to cook, or pick a recipe you can make from your inventory.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/voice" className="btn-primary">Plan by voice</Link>
              <Link to="/recipes" className="btn-secondary">Browse recipes</Link>
            </div>
          </div>
        )
      ) : (
        <div className="card-base p-4 flex items-start gap-3 border-[var(--color-accent-subtle)] bg-[var(--color-accent-subtle)]/30 fade-in-up stagger-2">
          <Sparkles size={18} className="text-[var(--color-accent)] shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-[var(--color-accent)]">
              AI Suggestion
            </p>
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
              Thursday has only 20 min cooking time. Masala Dosa (25 min) is a great quick breakfast option.
              Your pantry has all ingredients in stock.
            </p>
          </div>
        </div>
      )}

      {/* Weekly progress */}
      <div className="flex gap-1 fade-in-up stagger-3">
        {weeklyMealPlan.map((day) => {
          const total = Math.max(day.meals.length, 1);
          const done = day.meals.filter((m) => m.status === "completed").length;
          return (
            <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-subtle)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(done / total) * 100}%`,
                    backgroundColor: day.isToday ? "var(--color-accent)" : "var(--color-border-strong)",
                  }}
                />
              </div>
              <span className={`text-[10px] ${day.isToday ? "font-medium text-[var(--color-accent)]" : "text-[var(--color-text-tertiary)]"}`}>
                {day.day.slice(0, 3)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Meal Plan */}
      {view === "week" ? (
        <div className="space-y-6 fade-in-up stagger-4">
          {weeklyMealPlan.map((day) => (
            <DayColumn key={day.day} day={day} />
          ))}
        </div>
      ) : (
        <div className="fade-in-up stagger-4">
          {weeklyMealPlan.filter((d) => d.isToday).map((day) => (
            <DayColumn key={day.day} day={day} />
          ))}
        </div>
      )}
    </div>
  );
}
