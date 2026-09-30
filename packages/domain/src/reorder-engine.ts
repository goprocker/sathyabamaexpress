// Inventory reorder planner (deterministic). Finds items that are out of stock,
// below their safety threshold, or about to expire, works out how much to buy,
// and routes each item to the vendor that supplies its category. The agent layer
// turns each vendor group into an approval-gated Snapserve call.
import type { InventoryLot, Resource, Vendor } from "@household/contracts";
import { estimateOrderCostForDeficit } from "./ripple-engine.js";
import { formatQuantityDisplay } from "./unit-normalizer.js";

export type ReorderReason = "OUT_OF_STOCK" | "LOW_STOCK" | "EXPIRING";

export interface ReorderLine {
  resourceId: string;
  name: string;
  reason: ReorderReason;
  baseUnit: Resource["baseUnit"];
  displayUnit: Resource["displayUnit"];
  /** Stock that is usable once expiring lots are written off. */
  usableQuantity: number;
  expiringQuantity: number;
  nearestExpiryAt: string | null;
  safetyThreshold: number;
  targetQuantity: number;
  orderQuantity: number;
  estimatedCostInr: number;
}

export interface ReorderGroup {
  vendor: Vendor;
  lines: ReorderLine[];
  estimatedTotalCostInr: number;
}

export interface ReorderPlan {
  groups: ReorderGroup[];
  /** Items that need stock but no vendor in the household can supply. */
  unassigned: ReorderLine[];
}

export interface ReorderPlanInput {
  householdId: string;
  resources: Resource[];
  lots: InventoryLot[];
  vendors: Vendor[];
  /** Items to leave alone, e.g. already on an open order. */
  excludeResourceIds?: ReadonlySet<string>;
  now?: Date;
}

/** Lots expiring within this window are treated as gone when planning. */
export const REORDER_EXPIRY_WINDOW_HOURS = 36;
/** Order enough to cover this many days of normal use. */
export const REORDER_COVER_DAYS = 7;

/** Retail pack steps per base unit, so orders read like something a shop sells. */
const PACK_STEP: Record<Resource["baseUnit"], number> = { g: 250, ml: 200, count: 1 };

const normalizeCategory = (value: string): string => {
  const v = value.trim().toLowerCase();
  if (v === "spices") return "spice";
  if (v === "grains") return "grain";
  return v;
};

/** Vendor kinds from Setup ("milk", "poultry", …) → the food categories they supply. */
const KIND_CATEGORIES: Record<string, string[]> = {
  milk: ["dairy"],
  grocery: ["grain", "spice", "pantry", "dairy"],
  poultry: ["protein"],
  meat: ["protein"],
  fish: ["protein"],
  vegetables: ["produce"],
};
const FOOD_CATEGORIES = new Set(["produce", "dairy", "protein", "grain", "spice", "pantry"]);

function vendorCategories(vendor: Vendor): Set<string> {
  const all = [...(vendor.categories ?? []), ...(vendor.category ? [vendor.category] : [])].map(normalizeCategory);
  return new Set(all.flatMap((c) => KIND_CATEGORIES[c] ?? [c]));
}

/** Sells food at all (a plumber or gas agency is never sent a grocery order). */
const sellsFood = (vendor: Vendor) => [...vendorCategories(vendor)].some((c) => FOOD_CATEGORIES.has(c));

/**
 * Best vendor for a category: one that lists it, preferring the household's
 * preferred vendor, then reliability. Items in categories no vendor lists
 * (e.g. "pantry" from receipts) fall back to the preferred vendor, since a
 * general store usually carries them.
 */
export function pickVendorForCategory(category: string, vendors: Vendor[]): Vendor | null {
  const food = vendors.filter(sellsFood);
  if (food.length === 0) return null;
  const wanted = normalizeCategory(category);
  const rank = (a: Vendor, b: Vendor) =>
    Number(b.isPreferred) - Number(a.isPreferred) || (b.reliabilityScore ?? 0) - (a.reliabilityScore ?? 0);
  const matching = food.filter((v) => vendorCategories(v).has(wanted)).sort(rank);
  if (matching[0]) return matching[0];
  // Nobody lists it: a general grocery store usually carries it, else the preferred food vendor.
  const general = food.filter((v) => vendorCategories(v).has("pantry")).sort(rank);
  return general[0] ?? [...food].sort(rank)[0] ?? null;
}

const roundUpToPack = (qty: number, baseUnit: Resource["baseUnit"]) => {
  const step = PACK_STEP[baseUnit];
  return Math.max(step, Math.ceil(qty / step) * step);
};

/** Work out one resource's reorder need, or null when it is fine. */
export function assessResourceForReorder(
  resource: Resource,
  lots: InventoryLot[],
  now: Date = new Date(),
): ReorderLine | null {
  const horizon = now.getTime() + REORDER_EXPIRY_WINDOW_HOURS * 3_600_000;
  const activeLots = lots.filter(
    (l) => l.resourceId === resource.id && l.quantityRemaining > 0 && l.status !== "DEPLETED" && l.status !== "EXPIRED",
  );
  const expiringLots = activeLots.filter((l) => l.expiresAt && new Date(l.expiresAt).getTime() <= horizon);
  // Never write off more than is actually on hand.
  const expiringQuantity = Math.min(
    resource.onHandQuantity,
    expiringLots.reduce((sum, l) => sum + l.quantityRemaining, 0),
  );
  const nearestExpiryAt =
    expiringLots.map((l) => l.expiresAt ?? "").filter(Boolean).sort()[0] ?? null;

  const net = resource.onHandQuantity - resource.reservedQuantity + resource.incomingQuantity;
  const usable = net - expiringQuantity;

  let reason: ReorderReason | null = null;
  if (net <= 0) reason = "OUT_OF_STOCK";
  else if (expiringQuantity > 0 && usable <= resource.safetyThreshold) reason = "EXPIRING";
  else if (net <= resource.safetyThreshold) reason = "LOW_STOCK";
  if (!reason) return null;

  // Refill to a week of use or twice the safety threshold, whichever is larger.
  const targetQuantity = Math.max(resource.safetyThreshold * 2, resource.avgDailyBurn * REORDER_COVER_DAYS);
  const shortfall = targetQuantity - Math.max(0, usable);
  if (shortfall <= 0) return null;
  const orderQuantity = roundUpToPack(shortfall, resource.baseUnit);

  return {
    resourceId: resource.id,
    name: resource.canonicalName,
    reason,
    baseUnit: resource.baseUnit,
    displayUnit: resource.displayUnit,
    usableQuantity: Math.max(0, usable),
    expiringQuantity,
    nearestExpiryAt,
    safetyThreshold: resource.safetyThreshold,
    targetQuantity,
    orderQuantity,
    estimatedCostInr: estimateOrderCostForDeficit(resource.id, orderQuantity).costInr,
  };
}

/** Group every item that needs restocking by the vendor that should supply it. */
export function planInventoryReorders(input: ReorderPlanInput): ReorderPlan {
  const now = input.now ?? new Date();
  const vendors = input.vendors.filter((v) => v.householdId === input.householdId && v.phoneE164);
  const excluded = input.excludeResourceIds ?? new Set<string>();

  const byVendor = new Map<string, ReorderGroup>();
  const unassigned: ReorderLine[] = [];
  for (const resource of input.resources) {
    if (resource.householdId !== input.householdId || excluded.has(resource.id)) continue;
    const line = assessResourceForReorder(resource, input.lots, now);
    if (!line) continue;
    const vendor = pickVendorForCategory(resource.category, vendors);
    if (!vendor) {
      unassigned.push(line);
      continue;
    }
    const group = byVendor.get(vendor.id) ?? { vendor, lines: [], estimatedTotalCostInr: 0 };
    group.lines.push(line);
    group.estimatedTotalCostInr += line.estimatedCostInr;
    byVendor.set(vendor.id, group);
  }

  const reasonRank: Record<ReorderReason, number> = { OUT_OF_STOCK: 0, EXPIRING: 1, LOW_STOCK: 2 };
  const groups = [...byVendor.values()];
  for (const g of groups) g.lines.sort((a, b) => reasonRank[a.reason] - reasonRank[b.reason] || a.name.localeCompare(b.name));
  return { groups, unassigned };
}

export function describeReorderLine(line: ReorderLine): string {
  const fmt = (q: number) => formatQuantityDisplay(q, line.baseUnit, line.displayUnit);
  if (line.reason === "OUT_OF_STOCK") return `${line.name} is out of stock`;
  if (line.reason === "EXPIRING") {
    return `${fmt(line.expiringQuantity)} ${line.name.toLowerCase()} expires soon, leaving ${fmt(line.usableQuantity)}`;
  }
  return `${line.name} is down to ${fmt(line.usableQuantity)} (reorder level ${fmt(line.safetyThreshold)})`;
}
