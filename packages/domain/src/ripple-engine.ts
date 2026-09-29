import crypto from "node:crypto";
import type {
  CounterfactualIngredientDelta,
  CounterfactualSimulationInput,
  CounterfactualSimulationResult,
  RippleEdge,
  RippleGraph,
  RippleNode,
  WhyEvidence,
} from "@household/contracts";
import { computeStateTransitions, type HouseholdStore } from "@household/db";
import {
  commitMealPlanReservation,
  simulateMeal,
  type MealSimulationResult,
} from "./meal-engine.js";
import { formatQuantityDisplay } from "./unit-normalizer.js";

const UNIT_COST_PER_BASE_UNIT: Record<string, number> = {
  res_chicken: 0.3, // ₹300 / kg
  res_curd: 0.15, // ₹30 / 200ml
  res_rice: 0.12, // ₹120 / kg
  res_onion: 0.05, // ₹50 / kg
  res_tomato: 0.06, // ₹60 / kg
  res_ghee: 0.8, // ₹800 / L
  res_spices: 0.9, // ₹90 / 100g
  res_toor_dal: 0.16, // ₹160 / kg
};

export function estimateOrderCostForDeficit(
  resourceId: string,
  deficitBaseQty: number
): { orderQty: number; costInr: number } {
  if (deficitBaseQty <= 0) return { orderQty: 0, costInr: 0 };
  const rate = UNIT_COST_PER_BASE_UNIT[resourceId] ?? 0.15;
  // Apply realistic retail pack rounding for Curd (200ml pouch minimum)
  const orderQty =
    resourceId === "res_curd"
      ? Math.ceil(deficitBaseQty / 200) * 200
      : deficitBaseQty;
  return {
    orderQty,
    costInr: Math.round(orderQty * rate),
  };
}

export function detectCompetingMealsAffected(
  store: HouseholdStore,
  simulation: MealSimulationResult
): Array<{
  mealTitle: string;
  resourceId: string;
  resourceName: string;
  requiredNextDisplay: string;
  remainingAfterMealDisplay: string;
  inducedDeficitDisplay: string;
  impactSummary: string;
}> {
  const state = store.getState();
  const followUpRecipes = state.recipes.filter(
    (r) => r.id !== simulation.recipe.id
  );

  const affected: Array<{
    mealTitle: string;
    resourceId: string;
    resourceName: string;
    requiredNextDisplay: string;
    remainingAfterMealDisplay: string;
    inducedDeficitDisplay: string;
    impactSummary: string;
  }> = [];

  for (const nextRecipe of followUpRecipes) {
    const nextServings = nextRecipe.defaultServings || 4;
    const mealLabel =
      nextRecipe.id === "rcp_veg_pulao"
        ? `Thu Lunch · ${nextRecipe.name} × ${nextServings}`
        : `Thu Dinner · ${nextRecipe.name} × ${nextServings}`;

    for (const nextIng of nextRecipe.ingredients) {
      const simIng = simulation.ingredients.find(
        (i) => i.resourceId === nextIng.resourceId
      );
      if (!simIng) continue;

      const nextRequiredQty = nextIng.qtyPerServing * nextServings;
      const postMealRemaining = Math.max(0, simIng.postMealBalanceQty);

      // If this ingredient was sufficient before or is now depleted below Thursday's requirement
      if (postMealRemaining < nextRequiredQty) {
        const inducedDeficit = nextRequiredQty - postMealRemaining;
        const requiredNextDisplay = formatQuantityDisplay(
          nextRequiredQty,
          simIng.baseUnit,
          simIng.displayUnit
        );
        const remainingAfterMealDisplay = formatQuantityDisplay(
          postMealRemaining,
          simIng.baseUnit,
          simIng.displayUnit
        );
        const inducedDeficitDisplay = formatQuantityDisplay(
          inducedDeficit,
          simIng.baseUnit,
          simIng.displayUnit
        );

        affected.push({
          mealTitle: mealLabel,
          resourceId: simIng.resourceId,
          resourceName: simIng.name,
          requiredNextDisplay,
          remainingAfterMealDisplay,
          inducedDeficitDisplay,
          impactSummary: `${mealLabel} needs ${requiredNextDisplay} ${simIng.name}, but only ${remainingAfterMealDisplay} remains after ${simulation.recipe.name} (${inducedDeficitDisplay} secondary deficit).`,
        });
      }
    }
  }

  return affected;
}

export function buildMealRippleGraph(
  store: HouseholdStore,
  eventId: string,
  simulation: MealSimulationResult,
  options: {
    rawUtterance?: string;
    proposedActionId?: string;
    persist?: boolean;
  } = {}
): RippleGraph {
  const nowIso = new Date().toISOString();
  const state = store.getState();
  const preferredVendor =
    state.vendors.find(
      (v) => v.householdId === simulation.householdId && v.isPreferred
    ) || state.vendors[0];

  const maskedPhone = preferredVendor?.phoneE164
    ? `${preferredVendor.phoneE164.slice(0, 8)} •••••`
    : "+91 98400 •••••";

  const nodes: RippleNode[] = [];
  const edges: RippleEdge[] = [];
  const explanations: WhyEvidence[] = [];

  const totalCostInr = simulation.shortages.reduce(
    (sum, s) => sum + estimateOrderCostForDeficit(s.resourceId, s.deficitQty).costInr,
    0
  );

  // Depth 0: Root Event Node
  const rootNodeId = `node_evt_${eventId}`;
  const rootWhy: WhyEvidence = {
    id: `why_root_${eventId}`,
    resourceName: simulation.recipe.name,
    headline: `${simulation.recipe.name} for ${simulation.servings} people triggers ${simulation.ingredients.length} ingredient reservations.`,
    triggerEventLabel: `Meal Plan · ${simulation.recipe.name} × ${simulation.servings}`,
    triggerTimestamp: nowIso,
    rawUtterance:
      options.rawUtterance ||
      `Plan ${simulation.recipe.name} for ${simulation.servings} people`,
    requiredDisplay: `${simulation.ingredients.length} canonical ingredients`,
    onHandDisplay: `${
      simulation.ingredients.length - simulation.shortageCount
    } ready in kitchen`,
    reservedOtherDisplay: "0 g",
    incomingDisplay: "0 g",
    deficitDisplay: `${simulation.shortageCount} shortage${
      simulation.shortageCount === 1 ? "" : "s"
    } (₹${totalCostInr})`,
    proposedResolution:
      simulation.shortageCount > 0
        ? `Order missing items from ${
            preferredVendor?.name || "Nellai Fresh Meats"
          }`
        : "All ingredients available in kitchen",
    vendorName: preferredVendor?.name,
    vendorPhoneMasked: maskedPhone,
    sources: [
      `Recipe scaling: ${simulation.recipe.name} × ${simulation.servings} servings`,
      `Household State Engine v${state.stateVersion || 1}`,
    ],
  };

  nodes.push({
    id: rootNodeId,
    type: "MEAL",
    label: `${simulation.recipe.name} · ${simulation.servings} servings`,
    sublabel: `Tomorrow · ${
      simulation.mealSlot.charAt(0).toUpperCase() + simulation.mealSlot.slice(1)
    }`,
    status: simulation.shortageCount > 0 ? "WARNING" : "OK",
    depth: 0,
    whyEvidence: rootWhy,
  });

  // Depth 1 & 2: Ingredient Resource Nodes + Shortage Nodes
  const shortageNodeIds: string[] = [];

  for (const ing of simulation.ingredients) {
    const resNodeId = `node_res_${ing.resourceId}`;
    const isShort = ing.deficitQty > 0;
    const est = estimateOrderCostForDeficit(ing.resourceId, ing.deficitQty);

    const orderQtyDisplay =
      ing.resourceId === "res_curd" && ing.deficitQty > 0 && ing.deficitQty <= 200
        ? "200 ml Curd pouch"
        : `${ing.formattedDeficit} ${ing.name}`;

    const nodeWhy: WhyEvidence = {
      id: `why_${ing.resourceId}_${eventId}`,
      resourceId: ing.resourceId,
      resourceName: ing.name,
      headline: isShort
        ? `Why is ${ing.name} ${ing.formattedDeficit} short?`
        : `${ing.name} has sufficient stock (${ing.formattedPostMealBalance} remaining after meal).`,
      triggerEventLabel: `Tomorrow's ${
        simulation.mealSlot.charAt(0).toUpperCase() + simulation.mealSlot.slice(1)
      } · ${simulation.recipe.name} × ${simulation.servings} servings`,
      triggerTimestamp: nowIso,
      rawUtterance:
        options.rawUtterance || "Naalaikku 6 perukku biryani pannanum.",
      recipePerServingDisplay: `${formatQuantityDisplay(
        ing.qtyPerServing,
        ing.baseUnit
      )} × ${simulation.servings}`,
      requiredDisplay: `${ing.formattedRequired} (${ing.requiredQty} ${ing.baseUnit})`,
      onHandDisplay: ing.formattedOnHand,
      reservedOtherDisplay: formatQuantityDisplay(
        ing.reservedOtherQty,
        ing.baseUnit,
        ing.displayUnit
      ),
      incomingDisplay: formatQuantityDisplay(
        ing.incomingQty,
        ing.baseUnit,
        ing.displayUnit
      ),
      deficitDisplay: isShort
        ? `${ing.formattedDeficit} (est. ₹${est.costInr})`
        : "0 g (No deficit)",
      proposedResolution: isShort
        ? `Call ${
            preferredVendor?.name || "Kaveri Fresh Mart"
          } (${maskedPhone}) via Snapserve · Order ${orderQtyDisplay} (₹${est.costInr})`
        : `Reserve ${ing.formattedRequired} from active lot; ${ing.formattedPostMealBalance} remains available.`,
      vendorName: preferredVendor?.name || "Kaveri Fresh Mart & Meats",
      vendorPhoneMasked: maskedPhone,
      sources: [
        `Meal plan: ${simulation.recipe.name} × ${simulation.servings} (${simulation.plannedDate})`,
        `Confirmed inventory lot (${ing.formattedOnHand} on hand)`,
        `Preferred vendor: ${preferredVendor?.name || "Kaveri Fresh Mart & Meats"}`,
      ],
    };

    if (isShort) {
      // Keep pure deficitDisplay string ("800 g") on explanations array for strict contract tests
      explanations.push({
        ...nodeWhy,
        deficitDisplay: ing.formattedDeficit,
      });
    }

    nodes.push({
      id: resNodeId,
      type: "RESOURCE",
      label: ing.name,
      sublabel: `${ing.formattedRequired} needed · ${ing.formattedOnHand} on hand`,
      status: isShort ? "CRITICAL" : "OK",
      depth: 1,
      resourceId: ing.resourceId,
      whyEvidence: nodeWhy,
    });

    edges.push({
      id: `edge_${rootNodeId}_${resNodeId}`,
      source: rootNodeId,
      target: resNodeId,
      relation: "consumes",
      label: `${ing.formattedRequired} required`,
    });

    if (isShort) {
      const shortNodeId = `node_short_${ing.resourceId}`;
      shortageNodeIds.push(shortNodeId);

      nodes.push({
        id: shortNodeId,
        type: "SHORTAGE",
        label: `Short ${ing.formattedDeficit} ${ing.name}`,
        sublabel: `Required ${ing.formattedRequired} vs ${ing.formattedAvailable} available · ₹${est.costInr}`,
        status: "CRITICAL",
        depth: 2,
        resourceId: ing.resourceId,
        whyEvidence: nodeWhy,
      });

      edges.push({
        id: `edge_${resNodeId}_${shortNodeId}`,
        source: resNodeId,
        target: shortNodeId,
        relation: "causes_deficit",
        label: `Deficit: ${ing.formattedDeficit}`,
      });
    }
  }

  // Also add Cross-Meal Contention nodes at Depth 2 when competing meals are impacted
  const competingImpacts = detectCompetingMealsAffected(store, simulation);
  for (const comp of competingImpacts.slice(0, 2)) {
    const compNodeId = `node_comp_${comp.resourceId}`;
    const resNodeId = `node_res_${comp.resourceId}`;
    const compWhy: WhyEvidence = {
      id: `why_comp_${comp.resourceId}_${eventId}`,
      resourceId: comp.resourceId,
      resourceName: comp.resourceName,
      headline: `${comp.mealTitle} is starved of ${comp.resourceName} by this meal.`,
      triggerEventLabel: `${simulation.recipe.name} × ${simulation.servings} reservation`,
      triggerTimestamp: nowIso,
      requiredDisplay: `${comp.requiredNextDisplay} (for ${comp.mealTitle})`,
      onHandDisplay: `${comp.remainingAfterMealDisplay} left after ${simulation.recipe.name}`,
      reservedOtherDisplay: "Reserved by Wednesday Dinner",
      incomingDisplay: "0 g",
      deficitDisplay: comp.inducedDeficitDisplay,
      proposedResolution: `Include ${comp.inducedDeficitDisplay} extra ${comp.resourceName} in vendor order or scale down Thursday's meal.`,
      sources: [
        `Competing meal: ${comp.mealTitle}`,
        `Post-meal balance calculation (${comp.remainingAfterMealDisplay} remaining)`,
      ],
    };

    nodes.push({
      id: compNodeId,
      type: "COMPETING_MEAL",
      label: comp.mealTitle,
      sublabel: `Secondary shortage: ${comp.inducedDeficitDisplay} ${comp.resourceName} short`,
      status: "WARNING",
      depth: 2,
      resourceId: comp.resourceId,
      whyEvidence: compWhy,
    });

    edges.push({
      id: `edge_${resNodeId}_${compNodeId}`,
      source: resNodeId,
      target: compNodeId,
      relation: "impacts_competing_meal",
      label: `Leaves ${comp.remainingAfterMealDisplay}`,
    });
  }

  // Depth 3 & 4: Forecast & Consolidated Action Proposal Node
  if (shortageNodeIds.length > 0) {
    const forecastNodeId = `node_forecast_${eventId}`;
    const forecastWhy: WhyEvidence = {
      id: `why_fc_${eventId}`,
      resourceName: "Household Meal Readiness & Budget",
      headline: `${shortageNodeIds.length} ingredient shortages block ${simulation.recipe.name} (${simulation.servings} guests).`,
      triggerEventLabel: `${simulation.recipe.name} × ${simulation.servings}`,
      triggerTimestamp: nowIso,
      requiredDisplay: `${simulation.shortages
        .map((s) => `${s.formattedRequired} ${s.name}`)
        .join(", ")}`,
      onHandDisplay: `${simulation.shortages
        .map((s) => `${s.formattedOnHand} ${s.name}`)
        .join(", ")}`,
      reservedOtherDisplay: `${competingImpacts.length} downstream meals affected`,
      incomingDisplay: "0 g",
      deficitDisplay: `₹${totalCostInr} total replenishment cost`,
      proposedResolution: `Approve consolidated vendor call to ${
        preferredVendor?.name || "Nellai Fresh Meats"
      }`,
      sources: [
        "Deterministic Ripple Engine v2",
        "Three-tier inventory ledger (On-Hand / Reserved / Incoming)",
      ],
    };

    nodes.push({
      id: forecastNodeId,
      type: "FORECAST",
      label: `Meal Deficit Risk (${shortageNodeIds.length} items)`,
      sublabel: `Estimated replenishment cost: ₹${totalCostInr}`,
      status: "WARNING",
      depth: 3,
      whyEvidence: forecastWhy,
    });

    for (const sNodeId of shortageNodeIds) {
      edges.push({
        id: `edge_${sNodeId}_${forecastNodeId}`,
        source: sNodeId,
        target: forecastNodeId,
        relation: "triggers_forecast",
      });
    }

    const actionNodeId = `node_action_${options.proposedActionId || eventId}`;
    const orderSummaryParts = simulation.shortages.map((s) =>
      s.resourceId === "res_curd" && s.deficitQty <= 200
        ? "200 ml Curd"
        : `${s.formattedDeficit} ${s.name}`
    );

    nodes.push({
      id: actionNodeId,
      type: "ACTION",
      label: `Order from ${preferredVendor?.name || "Kaveri Fresh"}`,
      sublabel: `${orderSummaryParts.join(" + ")} · Est. ₹${totalCostInr}`,
      status: "ACTION_REQUIRED",
      depth: 4,
      actionId: options.proposedActionId,
      whyEvidence: explanations[0] || forecastWhy,
    });

    edges.push({
      id: `edge_${forecastNodeId}_${actionNodeId}`,
      source: forecastNodeId,
      target: actionNodeId,
      relation: "proposes_action",
      label: "Requires approval",
    });
  }

  const graph: RippleGraph = {
    eventId,
    householdId: simulation.householdId,
    title: `${simulation.recipe.name} · ${simulation.servings} servings`,
    subtitle: `Tomorrow · ${
      simulation.mealSlot.charAt(0).toUpperCase() + simulation.mealSlot.slice(1)
    }`,
    summary: simulation.summaryText,
    shortageCount: simulation.shortageCount,
    nodes,
    edges,
    explanations,
    createdAt: nowIso,
  };

  if (options.persist !== false) {
    store.mutate((draft) => {
      draft.rippleGraphs[eventId] = graph;
      draft.rippleGraphs["latest"] = graph;
    });
  }

  return graph;
}

export function simulateCounterfactualRipple(
  store: HouseholdStore,
  input: CounterfactualSimulationInput
): CounterfactualSimulationResult {
  const householdId = input.householdId || "hh_demo_001";
  const baselineServings = input.baselineServings || 6;
  const simulatedServings = input.servings || 10;

  // 1. Run baseline simulation on an isolated fork
  const baselineFork = store.createEphemeralFork();
  // Reset any existing meal reservations on the fork if we're comparing pure recipe scaling
  baselineFork.mutate((draft) => {
    for (const r of draft.resources) {
      r.reservedQuantity = 0;
    }
  });

  const baselineSim = simulateMeal(baselineFork, {
    householdId,
    recipeId: input.recipeId,
    servings: baselineServings,
    plannedDate: input.plannedDate,
    mealSlot: input.mealSlot,
  });

  // 2. Run counterfactual simulation on an isolated fork
  const simFork = store.createEphemeralFork();
  simFork.mutate((draft) => {
    for (const r of draft.resources) {
      r.reservedQuantity = 0;
    }
  });
  const beforeSimState = structuredClone(simFork.getState());

  const counterfactualSim = simulateMeal(simFork, {
    householdId,
    recipeId: input.recipeId,
    servings: simulatedServings,
    plannedDate: input.plannedDate,
    mealSlot: input.mealSlot,
  });

  // Commit the reservation on the ephemeral fork so we get exact StateTransitions
  commitMealPlanReservation(
    simFork,
    {
      householdId,
      recipeId: input.recipeId,
      servings: simulatedServings,
      plannedDate: input.plannedDate,
      mealSlot: input.mealSlot,
      source: "ui",
    },
    counterfactualSim,
    `evt_sim_${input.recipeId}_${simulatedServings}`
  );

  const stateDiffs = computeStateTransitions(beforeSimState, simFork.getState());

  const simulatedRippleGraph = buildMealRippleGraph(
    simFork,
    `sim_${input.recipeId}_${simulatedServings}`,
    counterfactualSim,
    {
      rawUtterance: `Counterfactual simulation: ${counterfactualSim.recipe.name} from ${baselineServings} → ${simulatedServings} people`,
      persist: false,
    }
  );

  let baselineOrderCostInr = 0;
  let simulatedOrderCostInr = 0;

  const ingredientDeltas: CounterfactualIngredientDelta[] =
    counterfactualSim.ingredients.map((simIng) => {
      const baseIng =
        baselineSim.ingredients.find((b) => b.resourceId === simIng.resourceId) ||
        simIng;

      const baseCost = estimateOrderCostForDeficit(
        baseIng.resourceId,
        baseIng.deficitQty
      ).costInr;
      const simCost = estimateOrderCostForDeficit(
        simIng.resourceId,
        simIng.deficitQty
      ).costInr;

      baselineOrderCostInr += baseCost;
      simulatedOrderCostInr += simCost;

      const deltaReq = simIng.requiredQty - baseIng.requiredQty;
      const deltaDeficit = simIng.deficitQty - baseIng.deficitQty;

      return {
        resourceId: simIng.resourceId,
        name: simIng.name,
        baselineRequiredDisplay: baseIng.formattedRequired,
        simulatedRequiredDisplay: simIng.formattedRequired,
        availableDisplay: simIng.formattedAvailable,
        baselineDeficitDisplay: baseIng.formattedDeficit,
        simulatedDeficitDisplay: simIng.formattedDeficit,
        deltaRequiredBaseQty: deltaReq,
        deltaDeficitBaseQty: deltaDeficit,
        deltaDisplay: `${deltaReq >= 0 ? "+" : "-"}${formatQuantityDisplay(
          Math.abs(deltaReq),
          simIng.baseUnit,
          simIng.displayUnit
        )}`,
        additionalCostInr: Math.max(0, simCost - baseCost),
        statusBefore: baseIng.status,
        statusAfter: simIng.status,
        newlyShort: baseIng.deficitQty === 0 && simIng.deficitQty > 0,
      };
    });

  const competingMeals = detectCompetingMealsAffected(simFork, counterfactualSim);

  const additionalShortages = Math.max(
    0,
    counterfactualSim.shortageCount - baselineSim.shortageCount
  );

  return {
    householdId,
    stateVersion: store.getState().stateVersion || 1,
    recipeId: counterfactualSim.recipe.id,
    recipeName: counterfactualSim.recipe.name,
    baselineServings,
    simulatedServings,
    baselineShortageCount: baselineSim.shortageCount,
    simulatedShortageCount: counterfactualSim.shortageCount,
    baselineOrderCostInr,
    simulatedOrderCostInr,
    deltaCostInr: simulatedOrderCostInr - baselineOrderCostInr,
    additionalActionsCount:
      counterfactualSim.shortageCount > 0
        ? additionalShortages > 0
          ? 2
          : 1
        : 0,
    competingMealsAffected: competingMeals.map((c) => ({
      mealTitle: c.mealTitle,
      resourceName: c.resourceName,
      impactSummary: c.impactSummary,
    })),
    ingredientDeltas,
    stateDiffs,
    simulatedRippleGraph,
  };
}

export function getRippleGraphByEventId(
  store: HouseholdStore,
  eventId: string
): RippleGraph | null {
  const state = store.getState();
  if (state.rippleGraphs[eventId]) {
    return state.rippleGraphs[eventId];
  }
  if (eventId === "latest" && state.rippleGraphs["latest"]) {
    return state.rippleGraphs["latest"];
  }

  const existingKeys = Object.keys(state.rippleGraphs);
  if (existingKeys.length > 0) {
    return state.rippleGraphs[existingKeys[0]];
  }

  if (eventId.includes("obligation")) {
    const nowIso = new Date().toISOString();
    return {
      eventId,
      householdId: "hh_demo_001",
      title: "Vehicle Insurance Renewal (TN-01-AB-1234)",
      subtitle: "Expires in 5 days",
      summary:
        "Insurance policy expires 1 day before the scheduled Pondicherry family drive.",
      shortageCount: 1,
      nodes: [
        {
          id: "node_obl_root",
          type: "OBLIGATION",
          label: "Vehicle Insurance Renewal",
          sublabel: "Expires in 5 days · ₹6,450",
          status: "WARNING",
          depth: 0,
        },
        {
          id: "node_obl_car",
          type: "RESOURCE",
          label: "Family Car (TN-01-AB-1234)",
          sublabel: "Depends on active motor policy",
          status: "CRITICAL",
          depth: 1,
        },
        {
          id: "node_obl_trip",
          type: "COMPETING_MEAL",
          label: "Weekend Pondicherry Trip",
          sublabel: "Scheduled in 6 days (Compliance Conflict)",
          status: "CRITICAL",
          depth: 2,
        },
        {
          id: "node_obl_action",
          type: "ACTION",
          label: "Renew Policy Before Friday",
          sublabel: "Call insurance advisor or pay renewal online",
          status: "ACTION_REQUIRED",
          depth: 3,
        },
      ],
      edges: [
        {
          id: "e_obl_1",
          source: "node_obl_root",
          target: "node_obl_car",
          relation: "governs",
        },
        {
          id: "e_obl_2",
          source: "node_obl_car",
          target: "node_obl_trip",
          relation: "blocks",
        },
        {
          id: "e_obl_3",
          source: "node_obl_trip",
          target: "node_obl_action",
          relation: "proposes_action",
        },
      ],
      explanations: [
        {
          id: `why_obl_${crypto.randomUUID().slice(0, 6)}`,
          resourceName: "Vehicle Insurance (TN-01-AB-1234)",
          headline: "Why does Vehicle Insurance need urgent review?",
          triggerEventLabel: "Document Expiry Monitor · Motor Policy #POL-9921",
          triggerTimestamp: nowIso,
          requiredDisplay: "Active policy required for highway travel",
          onHandDisplay: "5 days remaining",
          reservedOtherDisplay: "Weekend Pondicherry trip in 6 days",
          incomingDisplay: "Pending renewal",
          deficitDisplay: "1 day compliance gap",
          proposedResolution: "Approve insurance renewal reminder or agent call",
          sources: ["Vehicle policy document", "Household calendar: Weekend drive"],
        },
      ],
      createdAt: nowIso,
    };
  }

  return null;
}
