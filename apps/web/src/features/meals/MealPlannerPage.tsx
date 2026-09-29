// Meal planner + simulation (Design System §14)
// Required quantities shown here come from the API simulation —
// the frontend never computes business-critical arithmetic (AGENTS.md §6).
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Minus, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SectionHeader,
  StatusPill,
  type PillTone,
} from "@/components/ui/primitives";
import {
  useCommitMeal,
  useConsumeMeal,
  useRecipes,
} from "@/hooks/queries";
import { simulateMeal } from "@/lib/api";
import { formatQuantity } from "@/lib/format";
import type { MealSimulation, SimulationRowStatus } from "@/mocks/types";

function rowStatusPill(s: SimulationRowStatus): { tone: PillTone; label: string } {
  switch (s) {
    case "MISSING":
      return { tone: "danger", label: "Missing" };
    case "LOW":
      return { tone: "warning", label: "Short" };
    case "EXPIRING":
      return { tone: "warning", label: "Expiring" };
    default:
      return { tone: "accent", label: "Available" };
  }
}

export function MealPlannerPage() {
  const recipes = useRecipes();
  const commit = useCommitMeal();
  const consume = useConsumeMeal();
  const navigate = useNavigate();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [servings, setServings] = useState(6);
  const [simulation, setSimulation] = useState<MealSimulation | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [committedMealPlanId, setCommittedMealPlanId] = useState<string>("mp_biryani_001");
  const [cooked, setCooked] = useState(false);

  const recipe = recipes.data?.find((r) => r.id === selectedId) ?? null;
  const shortfallCount =
    simulation?.rows.filter((r) => r.status === "MISSING" || r.status === "LOW").length ?? 0;

  async function runSimulation(targetRecipeId = recipe?.id, targetServings = servings) {
    if (!targetRecipeId) return;
    setSimulating(true);
    try {
      const result = await simulateMeal(targetRecipeId, targetServings);
      setSimulation(result);
    } finally {
      setSimulating(false);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setSimulating(true);
    simulateMeal(selectedId, servings)
      .then((result) => {
        if (!cancelled) setSimulation(result);
      })
      .finally(() => {
        if (!cancelled) setSimulating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, servings]);

  async function handleCommit() {
    if (!recipe) return;
    const res = await commit.mutateAsync({ recipeId: recipe.id, servings });
    if (res.mealPlanId) setCommittedMealPlanId(res.mealPlanId);
    setCommitted(true);
  }

  async function handleMarkCooked() {
    await consume.mutateAsync(committedMealPlanId);
    setCooked(true);
  }

  if (recipes.isError) {
    return <ErrorState onRetry={() => void recipes.refetch()} />;
  }

  if (recipes.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader title="Plan a meal" />
        <ListSkeleton rows={4} />
      </div>
    );
  }

  // ── Step 3: committed confirmation ──────────────────────────────────────
  if (committed && recipe) {
    return (
      <div className="space-y-6">
        <PageHeader title="Plan a meal" />
        <div className="rounded-card border border-accent/25 bg-accent-subtle px-6 py-10 text-center">
          <Check size={22} strokeWidth={2} className="mx-auto text-accent" />
          <p className="mt-2 body-text font-medium">
            {cooked
              ? `${recipe.name} marked cooked — FEFO lots deducted`
              : `${recipe.name} · ${servings} servings planned`}
          </p>
          <p className="mt-1 text-small text-text-tertiary">
            {cooked
              ? "Canonical kitchen inventory has been reconciled."
              : "Ingredients are reserved in the canonical ledger and shortages have been rippled."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => void navigate({ to: "/ripple" })}>
              View ripple
            </Button>
            <Button variant="secondary" onClick={() => void navigate({ to: "/actions" })}>
              Review actions
            </Button>
            {!cooked && shortfallCount === 0 && (
              <Button
                variant="ghost"
                disabled={consume.isPending}
                onClick={() => void handleMarkCooked()}
              >
                {consume.isPending ? "Deducting…" : "Mark cooked (deduct inventory)"}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: configure + simulate ────────────────────────────────────────
  if (recipe) {
    return (
      <div className="space-y-6">
        <PageHeader title="Plan a meal" />
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4">
            <SectionHeader>{recipe.name}</SectionHeader>

            <Card className="px-5 py-4">
              <p className="text-meta">Servings</p>
              <div className="mt-2 flex items-center gap-4">
                <button
                  aria-label="Decrease servings"
                  onClick={() => setServings((s) => Math.max(1, s - 1))}
                  className="flex size-11 cursor-pointer items-center justify-center rounded-button border border-border transition-colors duration-150 hover:bg-surface-subtle"
                >
                  <Minus size={16} strokeWidth={1.75} />
                </button>
                <span className="w-10 text-center text-[22px] font-medium tabular-nums">
                  {servings}
                </span>
                <button
                  aria-label="Increase servings"
                  onClick={() => setServings((s) => Math.min(24, s + 1))}
                  className="flex size-11 cursor-pointer items-center justify-center rounded-button border border-border transition-colors duration-150 hover:bg-surface-subtle"
                >
                  <Plus size={16} strokeWidth={1.75} />
                </button>
              </div>
              <Divider />
              <p className="py-2 text-small text-text-secondary">
                Tomorrow · Dinner
              </p>
            </Card>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setSelectedId(null); setSimulation(null); }}>
                Change dish
              </Button>
              <Button variant="secondary" onClick={() => void runSimulation()} disabled={simulating}>
                {simulating ? "Checking inventory…" : "Re-check inventory"}
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader>Required ingredients (backend scaled)</SectionHeader>
            <Card className="px-5 py-2">
              {(simulation?.rows ?? []).map((row, idx) => (
                <div key={row.itemId}>
                  {idx > 0 && <Divider />}
                  <div className="flex items-center justify-between py-2.5">
                    <span className="body-text">{row.name}</span>
                    <span className="text-small text-text-secondary tabular-nums">
                      {formatQuantity(row.required, row.unit)}
                    </span>
                  </div>
                </div>
              ))}
              {!simulation && (
                <p className="py-3 text-small text-text-tertiary">
                  Calculating required quantities…
                </p>
              )}
            </Card>

            {simulation && (
              <>
                <SectionHeader>Inventory check</SectionHeader>
                <Card className="px-5 py-2">
                  {simulation.rows.map((row, idx) => {
                    const pill = rowStatusPill(row.status);
                    return (
                      <div key={row.itemId}>
                        {idx > 0 && <Divider />}
                        <div className="flex items-center justify-between py-2.5">
                          <div>
                            <span className="body-text">{row.name}</span>
                            {row.shortfall != null && (
                              <span className="ml-2 text-small text-danger">
                                {formatQuantity(row.shortfall, row.unit)} short
                              </span>
                            )}
                          </div>
                          <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                        </div>
                      </div>
                    );
                  })}
                </Card>

                <div className="flex items-center justify-between gap-3">
                  {shortfallCount > 0 ? (
                    <p className="text-small text-text-secondary">
                      {shortfallCount} ingredient{shortfallCount === 1 ? "" : "s"} need attention.
                    </p>
                  ) : (
                    <p className="text-small text-accent">Everything's available.</p>
                  )}
                  <Button variant="primary" onClick={() => void handleCommit()} disabled={commit.isPending}>
                    {commit.isPending ? "Planning…" : "Plan this meal"}
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ── Step 1: pick a dish ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader title="Plan a meal" subtitle="Choose a dish to check what's needed." />
      {recipes.data && recipes.data.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.data.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className="cursor-pointer rounded-card border border-border bg-surface px-5 py-4 text-left transition-colors duration-150 hover:border-border-strong"
            >
              <p className="body-text font-medium">{r.name}</p>
              <p className="text-meta">{r.cuisine}</p>
              <p className="mt-2 text-small text-text-tertiary">
                {r.ingredients.length} ingredients
              </p>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="No recipes yet." hint="Recipes will appear here once seeded." />
      )}
    </div>
  );
}

