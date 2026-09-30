import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ActionProposal, HouseholdNotification, Resource } from "@household/contracts";
import { applyNotificationDiff, diffNotifications, type NotificationSources } from "@household/domain";

const NOW = new Date("2026-09-30T08:00:00.000Z");

const milk = (onHand: number): Resource => ({
  id: "res_milk", householdId: "hh_1", canonicalName: "Milk", aliases: [], category: "dairy",
  baseUnit: "ml", displayUnit: "L", onHandQuantity: onHand, reservedQuantity: 0, incomingQuantity: 0,
  netAvailableQuantity: onHand, deficitQuantity: 0, safetyThreshold: 1000, avgDailyBurn: 500,
  daysUntilDepletion: null, status: "AVAILABLE", nearestExpiryAt: null, formattedOnHand: "",
  formattedReserved: "", formattedIncoming: "", formattedNetAvailable: "", formattedDeficit: "",
  updatedAt: NOW.toISOString(),
});

const sources = (over: Partial<NotificationSources>): NotificationSources => ({
  householdId: "hh_1", resources: [], lots: [], actions: [], receipts: [], existing: [], now: NOW, ...over,
});

/** Runs one engine pass and returns the updated feed. */
const step = (feed: HouseholdNotification[], over: Partial<NotificationSources>) =>
  applyNotificationDiff(feed, diffNotifications(sources({ ...over, existing: feed })), NOW);

describe("notification engine", () => {
  it("tells you once when milk runs low, and again only if it drops after a restock", () => {
    let feed = step([], { resources: [milk(400)] });
    assert.equal(feed.length, 1);
    assert.equal(feed[0]?.kind, "INVENTORY_LOW");
    assert.match(feed[0]?.title ?? "", /Milk is running low/);

    feed = step(feed, { resources: [milk(400)] });
    assert.equal(feed.length, 1, "no repeat while it stays low");

    feed = step(feed, { resources: [milk(2000)] });
    assert.ok(feed[0]?.resolvedAt && feed[0]?.readAt, "restocking clears and reads it");

    feed = step(feed, { resources: [milk(300)] });
    assert.equal(feed.filter((n) => n.kind === "INVENTORY_LOW").length, 2, "a new drop notifies again");
  });

  it("says out of stock, and expiring with the lot's date", () => {
    const feed = step([], {
      resources: [milk(0), { ...milk(500), id: "res_curd", canonicalName: "Curd", safetyThreshold: 100 }],
      lots: [{ id: "l1", resourceId: "res_curd", quantityRemaining: 500, purchasedAt: NOW.toISOString(), expiresAt: "2026-09-30T20:00:00.000Z", status: "ACTIVE" }],
    });
    const titles = feed.map((n) => n.title).sort();
    assert.deepEqual(titles, ["Curd expires tomorrow", "Milk is out of stock"]);
  });

  it("announces order outcomes once, and skips old history", () => {
    const order = (id: string, status: ActionProposal["status"], updatedAt: string): ActionProposal => ({
      id, householdId: "hh_1", sourceEventId: "e", type: "VENDOR_PURCHASE_CALL", status,
      title: "t", subtitle: "", reasonSummary: "", whyEvidence: [],
      items: [{ resourceId: "res_milk", name: "Milk", deficitDisplay: "1 L", orderQuantity: 1000, orderUnit: "ml", orderDisplay: "1.0 L", estimatedCostInr: 60 }],
      targetVendor: { id: "v", householdId: "hh_1", name: "Aavin", phoneE164: "+910000000000", isPreferred: true },
      estimatedTotalCostInr: 60, deliveryWindow: "", callScript: "", payloadHash: "", approvalRequired: true,
      callSteps: [], createdAt: updatedAt, updatedAt,
    });
    let feed = step([], { actions: [order("a1", "CONFIRMED", NOW.toISOString()), order("a0", "CONFIRMED", "2026-09-20T08:00:00.000Z")] });
    const confirmed = feed.filter((n) => n.kind === "ORDER_CONFIRMED");
    assert.equal(confirmed.length, 1);
    assert.equal(confirmed[0]?.title, "Aavin confirmed your order");
    feed = step(feed, { actions: [order("a1", "CONFIRMED", NOW.toISOString())] });
    assert.equal(feed.filter((n) => n.kind === "ORDER_CONFIRMED").length, 1);
  });
});
