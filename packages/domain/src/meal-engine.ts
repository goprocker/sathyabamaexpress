import crypto from "node:crypto";
import type {
  IngredientStatus,
  MealCommitInput,
  MealPlan,
  MealSimulationInput,
  Recipe,
  SimulatedIngredient,
} from "@household/contracts";
import { computeResourceDerivedFields, type HouseholdStore } from "@household/db";
import { formatQuantityDisplay } from "./unit-normalizer.js";

export interface MealSimulationResult {
  simulationId: string;
  householdId: string;
  recipe: Recipe;
  servings: number;
  plannedDate: string;
  mealSlot: "breakfast" | "lunch" | "dinner";
  ingredients: SimulatedIngredient[];
  shortages: SimulatedIngredient[];
  shortageCount: number;
  isReadyToCook: boolean;
  summaryText: string;
}

export function resolveRecipe(
  store: HouseholdStore,
  householdId: string,
  recipeId?: string,
  dishQuery?: string
): Recipe {
  const recipes = store
    .getState()
    .recipes.filter((r) => r.householdId === householdId);

  if (recipeId) {
    const byId = recipes.find((r) => r.id === recipeId);
    if (byId) return byId;
  }

  if (dishQuery && dishQuery.trim()) {
    const q = dishQuery.trim().toLowerCase();
    const matched = recipes.find(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        q.includes(r.name.toLowerCase()) ||
        r.aliases.some((a) => q.includes(a.toLowerCase()) || a.toLowerCase().includes(q))
    );
    if (matched) return matched;
  }

  // Default hero recipe: Chicken Biryani
  return recipes[0];
}

export function simulateMeal(
  store: HouseholdStore,
  input: MealSimulationInput
): MealSimulationResult {
  const householdId = input.householdId || "hh_demo_001";
  const recipe = resolveRecipe(store, householdId, input.recipeId, input.dish);
  const servings = input.servings || recipe.defaultServings || 6;
  const tomorrowIsoDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const plannedDate =
    !input.plannedDate || input.plannedDate === "tomorrow"
      ? tomorrowIsoDate
      : input.plannedDate;

  const state = store.getState();

  const ingredients: SimulatedIngredient[] = recipe.ingredients.map((ri) => {
    const resource = state.resources.find((r) => r.id === ri.resourceId);
    const onHandQty = resource?.onHandQuantity ?? 0;
    const reservedOtherQty = resource?.reservedQuantity ?? 0;
    const incomingQty = resource?.incomingQuantity ?? 0;
    const safetyThreshold = resource?.safetyThreshold ?? 0;

    // Exact deterministic multiplication: qtyPerServing * servings
    const requiredQty = Math.round(ri.qtyPerServing * servings);
    const netAvailableQty = Math.max(0, onHandQty - reservedOtherQty + incomingQty);
    const postMealBalanceQty = netAvailableQty - requiredQty;
    const deficitQty = Math.max(0, requiredQty - netAvailableQty);

    let status: IngredientStatus = "AVAILABLE";
    if (deficitQty > 0) {
      status = "MISSING";
    } else if (postMealBalanceQty <= safetyThreshold) {
      status = "LOW";
    }

    return {
      resourceId: ri.resourceId,
      name: ri.resourceName,
      baseUnit: ri.baseUnit,
      displayUnit: ri.displayUnit,
      qtyPerServing: Math.round(ri.qtyPerServing * 100) / 100,
      requiredQty,
      onHandQty,
      reservedOtherQty,
      incomingQty,
      netAvailableQty,
      postMealBalanceQty,
      deficitQty,
      formattedRequired: formatQuantityDisplay(requiredQty, ri.baseUnit, ri.displayUnit),
      formattedOnHand: formatQuantityDisplay(onHandQty, ri.baseUnit, ri.displayUnit),
      formattedAvailable: formatQuantityDisplay(
        netAvailableQty,
        ri.baseUnit,
        ri.displayUnit
      ),
      formattedDeficit: formatQuantityDisplay(deficitQty, ri.baseUnit, ri.displayUnit),
      formattedPostMealBalance: formatQuantityDisplay(
        Math.max(0, postMealBalanceQty),
        ri.baseUnit,
        ri.displayUnit
      ),
      status,
    };
  });

  const shortages = ingredients.filter((i) => i.deficitQty > 0);
  const shortageCount = shortages.length;
  const isReadyToCook = shortageCount === 0;

  const summaryText =
    shortageCount === 0
      ? `All ${ingredients.length} ingredients are available for ${recipe.name} (${servings} servings).`
      : `${shortageCount} of ${ingredients.length} ingredients are short (${shortages
          .map((s) => `${s.name} · ${s.formattedDeficit} short`)
          .join(", ")}).`;

  return {
    simulationId: `sim_${crypto.randomUUID().slice(0, 8)}`,
    householdId,
    recipe,
    servings,
    plannedDate,
    mealSlot: input.mealSlot || "dinner",
    ingredients,
    shortages,
    shortageCount,
    isReadyToCook,
    summaryText,
  };
}

export function commitMealPlanReservation(
  store: HouseholdStore,
  input: MealCommitInput,
  simulation: MealSimulationResult,
  eventId: string
): MealPlan {
  const nowIso = new Date().toISOString();

  return store.mutate(
    (draft) => {
      // Reserve available stock for this meal plan (up to onHand + incoming or full requiredQty so deficit shows clearly)
      for (const ing of simulation.ingredients) {
        const res = draft.resources.find((r) => r.id === ing.resourceId);
        if (res) {
          // If the same meal recipe was already planned earlier in demo, replace its reservation rather than double-stacking
          const existingSameMeal = draft.mealPlans.find(
            (mp) =>
              mp.recipeId === simulation.recipe.id &&
              mp.plannedDate === simulation.plannedDate &&
              mp.status !== "CANCELLED" &&
              mp.status !== "CONSUMED"
          );
          if (existingSameMeal) {
            res.reservedQuantity = ing.requiredQty;
          } else {
            res.reservedQuantity += ing.requiredQty;
          }
          res.updatedAt = nowIso;
        }
      }

      // Remove previous active duplicate meal plan for same date/recipe if re-triggered in demo
      draft.mealPlans = draft.mealPlans.filter(
        (mp) =>
          !(
            mp.recipeId === simulation.recipe.id &&
            mp.plannedDate === simulation.plannedDate &&
            mp.status !== "CONSUMED"
          )
      );

      const mealPlan: MealPlan = {
        id: `mp_${crypto.randomUUID().slice(0, 8)}`,
        householdId: simulation.householdId,
        recipeId: simulation.recipe.id,
        dishName: simulation.recipe.name,
        servings: simulation.servings,
        plannedDate: simulation.plannedDate,
        mealSlot: simulation.mealSlot,
        status:
          simulation.shortageCount > 0 ? "PLANNED_SHORTAGE" : "PLANNED_READY",
        shortageCount: simulation.shortageCount,
        sourceEventId: eventId,
        createdAt: nowIso,
      };

      draft.mealPlans.unshift(mealPlan);
      draft.resources = draft.resources.map((r) =>
        computeResourceDerivedFields(r, draft.lots)
      );

      return mealPlan;
    },
    {
      householdId: simulation.householdId,
      actor: "MealEngine",
      operation: "MEAL_PLAN_COMMIT",
      entityType: "MealPlan",
      entityId: eventId,
    }
  );
}

export function consumeMealIngredients(
  store: HouseholdStore,
  mealPlanId: string,
  householdId = "hh_demo_001"
): {
  eventId: string;
  mealPlan: MealPlan;
  consumedIngredients: Array<{
    resourceId: string;
    name: string;
    consumedBaseQty: number;
    formattedConsumed: string;
  }>;
} {
  const now = new Date();
  const nowIso = now.toISOString();
  const timeStr = now.toTimeString().slice(0, 5);
  const eventId = `evt_consume_${crypto.randomUUID().slice(0, 8)}`;

  return store.mutate(
    (draft) => {
      const mealPlan =
        draft.mealPlans.find((m) => m.id === mealPlanId) ??
        draft.mealPlans.find(
          (m) => m.householdId === householdId && m.status !== "CONSUMED"
        );
      if (!mealPlan) {
        throw new Error(`Meal plan ${mealPlanId} not found.`);
      }

      const recipe = draft.recipes.find((r) => r.id === mealPlan.recipeId);
      if (!recipe) {
        throw new Error(`Recipe ${mealPlan.recipeId} not found.`);
      }

      const consumedIngredients: Array<{
        resourceId: string;
        name: string;
        consumedBaseQty: number;
        formattedConsumed: string;
      }> = [];

      for (const ing of recipe.ingredients) {
        const res = draft.resources.find((r) => r.id === ing.resourceId);
        if (!res) continue;

        const requiredQty = Math.round(ing.qtyPerServing * mealPlan.servings);
        res.reservedQuantity = Math.max(0, res.reservedQuantity - requiredQty);
        res.onHandQuantity = Math.max(0, res.onHandQuantity - requiredQty);
        res.updatedAt = nowIso;

        // Deduct from active lots (FIFO by expiry)
        let remainingToDeduct = requiredQty;
        const activeLots = draft.lots
          .filter((l) => l.resourceId === res.id && l.status === "ACTIVE")
          .sort((a, b) =>
            (a.expiresAt || "9999").localeCompare(b.expiresAt || "9999")
          );
        for (const lot of activeLots) {
          if (remainingToDeduct <= 0) break;
          const deduct = Math.min(lot.quantityRemaining, remainingToDeduct);
          lot.quantityRemaining -= deduct;
          remainingToDeduct -= deduct;
          if (lot.quantityRemaining <= 0) {
            lot.status = "DEPLETED";
          }
        }

        consumedIngredients.push({
          resourceId: res.id,
          name: res.canonicalName,
          consumedBaseQty: requiredQty,
          formattedConsumed: formatQuantityDisplay(
            requiredQty,
            res.baseUnit,
            res.displayUnit
          ),
        });
      }

      mealPlan.status = "CONSUMED";
      mealPlan.shortageCount = 0;

      draft.resources = draft.resources.map((r) =>
        computeResourceDerivedFields(r, draft.lots)
      );

      draft.events.unshift({
        id: eventId,
        householdId,
        idempotencyKey: `consume_${mealPlan.id}_${now.getTime()}`,
        type: "MEAL_CONSUMED",
        source: "ui",
        confidence: 1.0,
        payload: {
          mealPlanId: mealPlan.id,
          recipeId: mealPlan.recipeId,
          dishName: mealPlan.dishName,
          servings: mealPlan.servings,
          consumedIngredients,
        },
        createdAt: nowIso,
      });

      draft.timeline.unshift({
        id: `tl_consume_${crypto.randomUUID().slice(0, 8)}`,
        householdId,
        eventId,
        timestamp: nowIso,
        timeFormatted: timeStr,
        title: `Meal cooked · ${mealPlan.dishName} (${mealPlan.servings} servings)`,
        description: `Released reservations and deducted ${consumedIngredients
          .map((c) => `${c.formattedConsumed} ${c.name}`)
          .join(", ")} from On-Hand stock.`,
        category: "meal",
        status: "SUCCESS",
      });

      return {
        eventId,
        mealPlan,
        consumedIngredients,
      };
    },
    {
      householdId,
      actor: "MealEngine",
      operation: "MEAL_CONSUMED",
      entityType: "MealPlan",
      entityId: mealPlanId,
    }
  );
}

