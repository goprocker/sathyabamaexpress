import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import {
  issueApprovalToken,
  matchCanonicalResource,
  normalizeToBaseUnit,
  simulateMeal,
  verifyApprovalToken,
} from "@household/domain";
import { assertToolAllowed, ToolPermissionError } from "@household/tools";

function createIsolatedStore(): HouseholdStore {
  const tempFile = path.join(
    os.tmpdir(),
    `household-unit-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  return new HouseholdStore(tempFile);
}

describe("Phase 3 & 4 — Deterministic Domain Engines & Security Guards", () => {
  it("normalizes mass, volume, and discrete units to canonical base units (g, ml, count)", () => {
    const rice = normalizeToBaseUnit(5, "kg");
    assert.equal(rice.baseQuantity, 5000);
    assert.equal(rice.baseUnit, "g");
    assert.equal(rice.displayUnit, "kg");

    const milk = normalizeToBaseUnit(0.4, "L");
    assert.equal(milk.baseQuantity, 400);
    assert.equal(milk.baseUnit, "ml");
    assert.equal(milk.displayUnit, "L");

    const chicken = normalizeToBaseUnit(700, "g");
    assert.equal(chicken.baseQuantity, 700);
    assert.equal(chicken.baseUnit, "g");
    assert.equal(chicken.displayUnit, "g");
  });

  it("matches English, Tanglish, and Tamil aliases to canonical household resources", () => {
    const store = createIsolatedStore();
    const resources = store.getState().resources;

    assert.equal(matchCanonicalResource("kozhi", resources)?.id, "res_chicken");
    assert.equal(matchCanonicalResource("தயிர்", resources)?.id, "res_curd");
    assert.equal(matchCanonicalResource("வெங்காயம்", resources)?.id, "res_onion");
    assert.equal(matchCanonicalResource("Basmati 5kg", resources)?.id, "res_rice");
  });

  it("scales Chicken Biryani × 6 deterministically and identifies 800g Chicken & 100ml Curd shortages", () => {
    const store = createIsolatedStore();
    const sim = simulateMeal(store, {
      householdId: "hh_demo_001",
      recipeId: "rcp_chicken_biryani",
      servings: 6,
      mealSlot: "dinner",
    });

    assert.equal(sim.servings, 6);
    assert.equal(sim.shortageCount, 2);
    assert.equal(sim.isReadyToCook, false);

    const rice = sim.ingredients.find((i) => i.resourceId === "res_rice")!;
    assert.equal(rice.requiredQty, 1200);
    assert.equal(rice.onHandQty, 5000);
    assert.equal(rice.deficitQty, 0);
    assert.equal(rice.status, "AVAILABLE");

    const chicken = sim.ingredients.find((i) => i.resourceId === "res_chicken")!;
    assert.equal(chicken.requiredQty, 1500);
    assert.equal(chicken.onHandQty, 700);
    assert.equal(chicken.deficitQty, 800);
    assert.equal(chicken.formattedDeficit, "800 g");
    assert.equal(chicken.status, "MISSING");

    const curd = sim.ingredients.find((i) => i.resourceId === "res_curd")!;
    assert.equal(curd.requiredQty, 300);
    assert.equal(curd.onHandQty, 200);
    assert.equal(curd.deficitQty, 100);
    assert.equal(curd.formattedDeficit, "100 ml");
    assert.equal(curd.status, "MISSING");
  });

  it("enforces agent tool allowlists and requires a valid HMAC token for snapserve.call", () => {
    const store = createIsolatedStore();

    // Supervisor cannot mutate inventory or call Snapserve
    assert.throws(
      () => assertToolAllowed(store, "Supervisor", "inventory.commit"),
      ToolPermissionError
    );
    assert.throws(
      () => assertToolAllowed(store, "MealEngine", "snapserve.call"),
      ToolPermissionError
    );

    // ExecutionEngine cannot call snapserve.call without an approval token
    assert.throws(
      () => assertToolAllowed(store, "ExecutionEngine", "snapserve.call"),
      ToolPermissionError
    );

    // Create a mock action and issue an HMAC token
    store.mutate((draft) => {
      draft.actions.push({
        id: "act_test_hmac",
        householdId: "hh_demo_001",
        sourceEventId: "evt_seed_receipt_001",
        type: "VENDOR_PURCHASE_CALL",
        status: "PENDING_APPROVAL",
        title: "Test Action",
        subtitle: "Test",
        reasonSummary: "Test",
        whyEvidence: [],
        items: [],
        estimatedTotalCostInr: 240,
        deliveryWindow: "Tomorrow",
        callScript: "Test script",
        payloadHash: "hash_abc_123",
        approvalRequired: true,
        approvedBy: null,
        approvedAt: null,
        externalCallId: null,
        externalCallStatus: null,
        callSteps: [],
        outcome: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    const issued = issueApprovalToken(store, "act_test_hmac", "usr_sai_001");
    const verification = verifyApprovalToken(store, "act_test_hmac", issued.token);
    assert.equal(verification.valid, true);

    // ExecutionEngine succeeds with valid token
    assert.doesNotThrow(() =>
      assertToolAllowed(store, "ExecutionEngine", "snapserve.call", {
        actionId: "act_test_hmac",
        approvalToken: issued.token,
      })
    );

    // If state drifts (payloadHash changes), approval token becomes invalid
    store.mutate((draft) => {
      const target = draft.actions.find((a) => a.id === "act_test_hmac");
      if (target) target.payloadHash = "drifted_hash_999";
    });

    const postDrift = verifyApprovalToken(store, "act_test_hmac", issued.token);
    assert.equal(postDrift.valid, false);
  });
});
