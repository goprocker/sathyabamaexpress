// Shortage orders: after the ripple engine finds items short for planned meals,
// prepare one order per store that sells them (the household's own vendors,
// matched by category). Each order becomes a VENDOR_PURCHASE_CALL; one tap on
// "Call store" approves it and the agent phones the store.
import crypto from "node:crypto";
import type { ActionOrderItem, ActionProposal, Resource, Vendor, WhyEvidence } from "@household/contracts";
import type { HouseholdStore } from "@household/db";
import {
  computePayloadHash,
  estimateOrderCostForDeficit,
  formatQuantityDisplay,
  pickVendorForCategory,
} from "@household/domain";
import { buildVendorCallScript } from "./voice-agent.js";

export const SHORTAGE_DELIVERY = "tomorrow morning before 10:00 AM";
const OPEN = new Set<ActionProposal["status"]>(["PENDING_APPROVAL", "APPROVED", "EXECUTING"]);

export interface ShortageOrderPlan {
  proposals: ActionProposal[];
  /** Short items no household store sells (add a store to order them). */
  unassigned: Array<{ resourceId: string; name: string; deficitDisplay: string }>;
}

interface Line {
  resource: Resource;
  orderQuantity: number;
  costInr: number;
}

/**
 * Prepares (does not save) per-store orders for every item that is short right
 * now and not already on an open order. `sourceEventId` ties them to the meal.
 */
export function planShortageOrders(
  store: HouseholdStore,
  options: {
    householdId: string;
    sourceEventId: string;
    reason?: string;
    /** false: keep orders already waiting for a tap and only add what they don't cover. */
    rebuildPending?: boolean;
  },
): ShortageOrderPlan {
  const rebuild = options.rebuildPending ?? true;
  const state = store.getState();
  const { householdId } = options;
  const vendors = state.vendors.filter((v) => v.householdId === householdId && v.phoneE164);
  const onOrder = new Set(
    state.actions
      // Waiting meal orders are rebuilt (they're replaced on save); anything approved or on a call counts as ordered.
      .filter(
        (a) =>
          a.householdId === householdId &&
          OPEN.has(a.status) &&
          // When rebuilding for a new meal plan, orders still waiting for a tap (meal or restock) are
          // superseded: the meal's orders take their items and saveShortageOrders withdraws them.
          !(
            rebuild &&
            a.status === "PENDING_APPROVAL" &&
            (a.origin === "MEAL_SHORTAGE" || a.origin === "INVENTORY_REORDER" || !a.origin)
          ),
      )
      .flatMap((a) => a.items.map((i) => i.resourceId)),
  );
  const short = state.resources.filter(
    (r) => r.householdId === householdId && r.deficitQuantity > 0 && !onOrder.has(r.id),
  );

  const groups = new Map<string, { vendor: Vendor; lines: Line[] }>();
  const unassigned: ShortageOrderPlan["unassigned"] = [];
  for (const resource of short) {
    const { orderQty, costInr } = estimateOrderCostForDeficit(resource.id, resource.deficitQuantity);
    const vendor = pickVendorForCategory(resource.category, vendors);
    if (!vendor) {
      unassigned.push({ resourceId: resource.id, name: resource.canonicalName, deficitDisplay: resource.formattedDeficit });
      continue;
    }
    const group = groups.get(vendor.id) ?? { vendor, lines: [] };
    group.lines.push({ resource, orderQuantity: orderQty, costInr });
    groups.set(vendor.id, group);
  }

  const householdName = state.households.find((h) => h.id === householdId)?.name;
  const nowIso = new Date().toISOString();
  const proposals = [...groups.values()].map(({ vendor, lines }) => {
    const actionId = `act_${crypto.randomUUID().slice(0, 8)}`;
    const items: ActionOrderItem[] = lines.map(({ resource: r, orderQuantity, costInr }) => ({
      resourceId: r.id,
      name: r.canonicalName,
      deficitDisplay: r.formattedDeficit,
      orderQuantity,
      orderUnit: r.baseUnit,
      orderDisplay: formatQuantityDisplay(orderQuantity, r.baseUnit, r.displayUnit),
      estimatedCostInr: costInr,
    }));
    const whyEvidence: WhyEvidence[] = lines.map(({ resource: r, orderQuantity }) => ({
      id: `why_short_${actionId}_${r.id}`,
      resourceId: r.id,
      resourceName: r.canonicalName,
      headline: `${r.canonicalName}: need ${r.formattedReserved}, have ${r.formattedOnHand}`,
      triggerEventLabel: options.reason ?? "Meal plan",
      triggerTimestamp: nowIso,
      requiredQty: r.reservedQuantity,
      onHandQty: r.onHandQuantity,
      incomingQty: r.incomingQuantity,
      deficitQty: r.deficitQuantity,
      unit: r.baseUnit,
      displayUnit: r.displayUnit,
      requiredDisplay: r.formattedReserved,
      onHandDisplay: r.formattedOnHand,
      incomingDisplay: r.formattedIncoming,
      deficitDisplay: r.formattedDeficit,
      formulaText: `needed ${r.formattedReserved} − on hand ${r.formattedOnHand} − incoming ${r.formattedIncoming} = short ${r.formattedDeficit}`,
      proposedResolution: `Order ${formatQuantityDisplay(orderQuantity, r.baseUnit, r.displayUnit)} from ${vendor.name}`,
      vendorName: vendor.name,
      sources: ["meal plan", "inventory", "vendors"],
    }));
    const total = items.reduce((s, i) => s + i.estimatedCostInr, 0);
    const proposal: ActionProposal = {
      id: actionId,
      householdId,
      sourceEventId: options.sourceEventId,
      type: "VENDOR_PURCHASE_CALL",
      origin: "MEAL_SHORTAGE",
      status: "PENDING_APPROVAL",
      title: `Purchase ${items.map((i) => `${i.orderDisplay} ${i.name}`).join(" & ")}`,
      subtitle: `${vendor.name} · Tomorrow morning delivery`,
      reasonSummary: `${options.reason ?? "Your meal plan"} needs ${items
        .map((i) => `${i.deficitDisplay} more ${i.name.toLowerCase()}`)
        .join(", ")}.`,
      whyEvidence,
      targetVendor: vendor,
      items,
      estimatedTotalCostInr: total,
      deliveryWindow: "Tomorrow morning (before 10:00 AM)",
      callScript: buildVendorCallScript({
        householdName,
        items: items.map((i) => ({ orderDisplay: i.orderDisplay, name: i.name })),
        deliveryWindow: SHORTAGE_DELIVERY,
      }).combined,
      payloadHash: computePayloadHash({
        actionId,
        householdId,
        vendorId: vendor.id,
        items: items.map((i) => ({ resourceId: i.resourceId, orderQuantity: i.orderQuantity, orderUnit: i.orderUnit })),
      }),
      approvalRequired: true,
      approvedBy: null,
      approvedAt: null,
      externalCallId: null,
      externalCallStatus: null,
      callSteps: [],
      outcome: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    return proposal;
  });

  return { proposals, unassigned };
}

/**
 * Saves shortage orders, replacing older meal orders still waiting for a tap and
 * any waiting restock that shares an item with them (the next stock check
 * re-proposes the rest). Phone orders and anything already called are kept.
 */
export function saveShortageOrders(store: HouseholdStore, householdId: string, proposals: ActionProposal[]) {
  const claimed = new Set(proposals.flatMap((p) => p.items.map((i) => i.resourceId)));
  store.mutate(
    (draft) => {
      draft.actions = draft.actions.filter((a) => {
        if (a.householdId !== householdId || a.status !== "PENDING_APPROVAL") return true;
        if (a.origin === "MEAL_SHORTAGE" || !a.origin) return false;
        if (a.origin === "INVENTORY_REORDER") return !a.items.some((i) => claimed.has(i.resourceId));
        return true;
      });
      draft.actions.unshift(...proposals);
    },
    {
      householdId,
      actor: "ActionPlannerAgent",
      operation: "SHORTAGE_ORDERS_PREPARED",
      entityType: "ActionProposal",
      entityId: proposals.map((p) => p.id).join(",") || "none",
    },
  );
}

/** Adds orders without touching existing ones (used when a store is added after the meal was planned). */
export function appendShortageOrders(store: HouseholdStore, householdId: string, proposals: ActionProposal[]) {
  if (proposals.length === 0) return;
  store.mutate(
    (draft) => {
      draft.actions.unshift(...proposals);
    },
    {
      householdId,
      actor: "ActionPlannerAgent",
      operation: "SHORTAGE_ORDERS_PREPARED",
      entityType: "ActionProposal",
      entityId: proposals.map((p) => p.id).join(","),
    },
  );
}
