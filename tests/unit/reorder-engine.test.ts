import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { InventoryLot, Resource, Vendor } from "@household/contracts";
import { assessResourceForReorder, pickVendorForCategory, planInventoryReorders } from "@household/domain";

const NOW = new Date("2026-09-30T08:00:00.000Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

function resource(overrides: Partial<Resource>): Resource {
  return {
    id: "res_x",
    householdId: "hh_1",
    canonicalName: "Rice",
    aliases: [],
    category: "grain",
    baseUnit: "g",
    displayUnit: "kg",
    onHandQuantity: 5000,
    reservedQuantity: 0,
    incomingQuantity: 0,
    netAvailableQuantity: 5000,
    deficitQuantity: 0,
    safetyThreshold: 1000,
    avgDailyBurn: 200,
    daysUntilDepletion: 25,
    status: "AVAILABLE",
    nearestExpiryAt: null,
    formattedOnHand: "",
    formattedReserved: "",
    formattedIncoming: "",
    formattedNetAvailable: "",
    formattedDeficit: "",
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

const lot = (resourceId: string, qty: number, expiresAt: string | null): InventoryLot => ({
  id: `lot_${resourceId}_${qty}`,
  resourceId,
  quantityRemaining: qty,
  purchasedAt: NOW.toISOString(),
  expiresAt,
  status: "ACTIVE",
});

const vendor = (id: string, categories: string[], isPreferred = false): Vendor => ({
  id,
  householdId: "hh_1",
  name: id,
  categories,
  phoneE164: "+910000000000",
  isPreferred,
});

describe("reorder engine", () => {
  it("leaves well-stocked items alone", () => {
    assert.equal(assessResourceForReorder(resource({}), [], NOW), null);
  });

  it("flags out-of-stock items and refills to a week of use, in whole packs", () => {
    const line = assessResourceForReorder(resource({ onHandQuantity: 0 }), [], NOW);
    assert.equal(line?.reason, "OUT_OF_STOCK");
    // target = max(2 × 1000, 7 × 200) = 2000 g; 250 g packs.
    assert.equal(line?.orderQuantity, 2000);
  });

  it("counts reservations and incoming stock", () => {
    const reserved = assessResourceForReorder(resource({ onHandQuantity: 1500, reservedQuantity: 1000 }), [], NOW);
    assert.equal(reserved?.reason, "LOW_STOCK");
    const covered = assessResourceForReorder(
      resource({ onHandQuantity: 500, incomingQuantity: 2000 }),
      [],
      NOW,
    );
    assert.equal(covered, null, "an order already on the way covers it");
  });

  it("treats stock expiring within 36 h as gone", () => {
    const r = resource({ id: "res_curd", onHandQuantity: 1200, baseUnit: "ml", displayUnit: "ml", safetyThreshold: 400, avgDailyBurn: 100 });
    const line = assessResourceForReorder(r, [lot("res_curd", 1000, inHours(20)), lot("res_curd", 200, inHours(200))], NOW);
    assert.equal(line?.reason, "EXPIRING");
    assert.equal(line?.expiringQuantity, 1000);
    assert.equal(line?.usableQuantity, 200);
    // target 800 ml − 200 usable = 600 → 200 ml packs.
    assert.equal(line?.orderQuantity, 600);
    const later = assessResourceForReorder(r, [lot("res_curd", 1000, inHours(100))], NOW);
    assert.equal(later, null, "expiry beyond the window is not a reason yet");
  });

  it("routes items to a vendor that lists the category, normalising plurals and case", () => {
    const vendors = [vendor("general", ["grain", "dairy"], true), vendor("spice_shop", ["spice"])];
    assert.equal(pickVendorForCategory("Spices", vendors)?.id, "spice_shop");
    assert.equal(pickVendorForCategory("Grains", vendors)?.id, "general");
    assert.equal(pickVendorForCategory("pantry", vendors)?.id, "general", "unlisted categories go to the preferred vendor");
    assert.equal(pickVendorForCategory("grain", []), null);
  });

  it("groups by vendor and skips excluded items", () => {
    const plan = planInventoryReorders({
      householdId: "hh_1",
      resources: [
        resource({ id: "res_rice", onHandQuantity: 0 }),
        resource({ id: "res_chilli", canonicalName: "Chilli powder", category: "spices", onHandQuantity: 0 }),
        resource({ id: "res_dal", canonicalName: "Toor dal", onHandQuantity: 0 }),
      ],
      lots: [],
      vendors: [vendor("general", ["grain"], true), vendor("spice_shop", ["spice"])],
      excludeResourceIds: new Set(["res_dal"]),
      now: NOW,
    });
    const byVendor = Object.fromEntries(plan.groups.map((g) => [g.vendor.id, g.lines.map((l) => l.resourceId)]));
    assert.deepEqual(byVendor, { general: ["res_rice"], spice_shop: ["res_chilli"] });
    assert.deepEqual(plan.unassigned, []);
  });
});
