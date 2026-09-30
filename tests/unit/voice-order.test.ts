import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Resource, Vendor } from "@household/contracts";
import { normalizePhoneE164, parseSpokenOrder, planVoiceOrder, samePhone } from "@household/domain";
import type { SnapserveCallListItem } from "@household/integrations";
import { classifyOrderCall, readOrderDisposition } from "../../apps/api/src/phone-orders.js";

const vendor = (id: string, categories: string[], isPreferred = false): Vendor => ({
  id,
  householdId: "hh_1",
  name: id === "dairy_shop" ? "Aavin Milk Booth" : id,
  categories,
  phoneE164: "+910000000000",
  isPreferred,
});

describe("phone numbers", () => {
  it("normalises Indian numbers as people type them", () => {
    assert.equal(normalizePhoneE164("98400 12345"), "+919840012345");
    assert.equal(normalizePhoneE164("098400-12345"), "+919840012345");
    assert.equal(normalizePhoneE164("+91 98400 12345"), "+919840012345");
    assert.equal(normalizePhoneE164("919840012345"), "+919840012345");
    assert.equal(normalizePhoneE164("12345"), null);
  });
  it("compares numbers regardless of formatting", () => {
    assert.ok(samePhone("+919840012345", "09840012345"));
    assert.ok(!samePhone("+919840012345", "+919840012346"));
    assert.ok(!samePhone(null, "+919840012345"));
  });
});

describe("spoken order parsing", () => {
  it("reads quantities, units and item names", () => {
    assert.deepEqual(parseSpokenOrder("2 kg rice; 1 litre milk; half kg onions, 6 eggs and a packet of bread"), [
      { name: "rice", quantity: 2000, baseUnit: "g" },
      { name: "milk", quantity: 1000, baseUnit: "ml" },
      { name: "onions", quantity: 500, baseUnit: "g" },
      { name: "eggs", quantity: 6, baseUnit: "count" },
      { name: "bread", quantity: 1, baseUnit: "count" },
    ]);
    assert.deepEqual(parseSpokenOrder("500g paneer"), [{ name: "paneer", quantity: 500, baseUnit: "g" }]);
    assert.deepEqual(parseSpokenOrder("1 dozen bananas"), [{ name: "bananas", quantity: 12, baseUnit: "count" }]);
    assert.deepEqual(parseSpokenOrder(""), []);
  });
});

describe("routing a phone order to stores", () => {
  const vendors = [vendor("general", ["grain", "pantry"], true), vendor("dairy_shop", ["dairy"])];
  const rice: Resource = {
    id: "res_rice", householdId: "hh_1", canonicalName: "Basmati Rice", aliases: ["rice"], category: "grain",
    baseUnit: "g", displayUnit: "kg", onHandQuantity: 0, reservedQuantity: 0, incomingQuantity: 0,
    netAvailableQuantity: 0, deficitQuantity: 0, safetyThreshold: 500, avgDailyBurn: 100, daysUntilDepletion: 0,
    status: "LOW", nearestExpiryAt: null, formattedOnHand: "", formattedReserved: "", formattedIncoming: "",
    formattedNetAvailable: "", formattedDeficit: "", updatedAt: "",
  };

  it("sends each item to the store that sells it and links tracked items", () => {
    const { groups, unassigned } = planVoiceOrder({
      householdId: "hh_1",
      items: parseSpokenOrder("2 kg rice; 1 litre milk; 1 packet soap"),
      resources: [rice],
      vendors,
    });
    const byStore = Object.fromEntries(groups.map((g) => [g.vendor.id, g.lines.map((l) => `${l.orderDisplay} ${l.name}`)]));
    assert.deepEqual(byStore, { general: ["2.0 kg Basmati Rice", "1 pcs Soap"], dairy_shop: ["1.0 L Milk"] });
    assert.equal(groups.find((g) => g.vendor.id === "general")?.lines[0]?.tracked, true);
    assert.deepEqual(unassigned, []);
  });

  it("uses the store the caller named", () => {
    const { groups } = planVoiceOrder({
      householdId: "hh_1",
      items: parseSpokenOrder("2 kg rice"),
      resources: [],
      vendors,
      preferredStore: "aavin",
    });
    assert.equal(groups[0]?.vendor.id, "dairy_shop");
  });

  it("reports items when there are no stores", () => {
    const { groups, unassigned } = planVoiceOrder({ householdId: "hh_1", items: parseSpokenOrder("2 kg rice"), resources: [], vendors: [] });
    assert.equal(groups.length, 0);
    assert.deepEqual(unassigned, ["rice"]);
  });
});

describe("ordering-agent calls", () => {
  const now = Date.parse("2026-09-30T10:00:00Z");
  const call = (overrides: Partial<SnapserveCallListItem>): SnapserveCallListItem => ({
    id: "1",
    agentId: 1356,
    status: "completed",
    direction: "inbound",
    fromNumber: "+919344097020",
    toNumber: "+918071581642",
    transcript: null,
    callSummary: null,
    disposition: { order_items: "2 kg rice; 1 litre milk", order_confirmed: true, preferred_store: "", delivery_note: "none" },
    createdAt: "2026-09-30T09:55:00Z",
    endedAt: "2026-09-30T09:58:00Z",
    ...overrides,
  });

  it("accepts a completed, confirmed inbound order", () => {
    const out = classifyOrderCall(call({}), now);
    assert.equal(out.kind, "order");
    if (out.kind === "order") {
      assert.equal(out.order.orderText, "2 kg rice; 1 litre milk");
      assert.equal(out.order.preferredStore, null);
      assert.equal(out.order.deliveryNote, null);
    }
  });

  it("waits for calls in progress and for the extraction to arrive", () => {
    assert.equal(classifyOrderCall(call({ status: "in_progress" }), now).kind, "waiting");
    assert.equal(classifyOrderCall(call({ disposition: null }), now).kind, "waiting");
  });

  it("ignores unconfirmed, failed, outbound and old calls", () => {
    assert.equal(classifyOrderCall(call({ disposition: { order_items: "2 kg rice", order_confirmed: false } }), now).kind, "ignored");
    assert.equal(classifyOrderCall(call({ status: "no_pickup" }), now).kind, "ignored");
    assert.equal(classifyOrderCall(call({ direction: "outbound" }), now).kind, "ignored");
    assert.equal(classifyOrderCall(call({ endedAt: "2026-09-30T07:00:00Z" }), now).kind, "ignored");
  });

  it("reads string booleans in the extraction", () => {
    assert.equal(readOrderDisposition({ order_items: "1 kg dal", order_confirmed: "Yes" })?.confirmed, true);
    assert.equal(readOrderDisposition({ order_items: "", order_confirmed: true }), null);
  });
});
