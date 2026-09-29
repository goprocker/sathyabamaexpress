import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { buildApiApp } from "../../apps/api/src/app.js";

describe("Phase 7 — End-to-End Signature Judge Demo Pipeline", () => {
  it("runs the complete <2 minute Signature Demo: Reset -> Receipt -> Tanglish Voice -> Ripple -> Approval -> Snapserve -> Reconciliation", async () => {
    const tempFile = path.join(
      os.tmpdir(),
      `household-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    const store = new HouseholdStore(tempFile);
    const app = buildApiApp(store);

    // 1. Reset Demo State
    const resetRes = await app.inject({
      method: "POST",
      url: "/api/demo/reset",
      payload: { householdId: "hh_demo_001" },
    });
    assert.equal(resetRes.statusCode, 200);
    assert.equal(resetRes.json().ok, true);

    // 2. Upload / Extract Grocery Receipt
    const extractRes = await app.inject({
      method: "POST",
      url: "/api/receipts/extract",
      payload: { householdId: "hh_demo_001" },
    });
    assert.equal(extractRes.statusCode, 200);
    const extractedData = extractRes.json();
    assert.equal(extractedData.items.length, 4);
    assert.equal(extractedData.needsReviewCount, 1); // Curd 200ml (confidence 0.74 < 0.85)

    // 3. Confirm Receipt Items
    const confirmRes = await app.inject({
      method: "POST",
      url: `/api/receipts/${extractedData.receiptId}/confirm`,
      payload: {
        householdId: "hh_demo_001",
        idempotencyKey: "idem_demo_receipt_01",
        items: extractedData.items,
      },
    });
    assert.equal(confirmRes.statusCode, 200);

    // 4. Speak Tanglish Meal Command ("Naalaikku 6 perukku biryani pannanum.")
    const voiceRes = await app.inject({
      method: "POST",
      url: "/api/voice/transcribe",
      payload: {
        householdId: "hh_demo_001",
        transcriptOverride: "Naalaikku 6 perukku biryani pannanum.",
        autoSimulate: true,
        autoCommit: false,
      },
    });
    assert.equal(voiceRes.statusCode, 200);
    const voiceData = voiceRes.json();
    assert.equal(voiceData.structuredIntent.intent, "MEAL_PLANNED");
    assert.equal(voiceData.structuredIntent.servings, 6);
    assert.equal(voiceData.simulation.shortageCount, 2);

    // 5. Commit Meal Plan -> Triggers Ripple Engine, Forecast Engine & Action Planner
    const commitMealRes = await app.inject({
      method: "POST",
      url: "/api/meals/commit",
      payload: {
        householdId: "hh_demo_001",
        idempotencyKey: "idem_biryani_commit_01",
        recipeId: "rcp_chicken_biryani",
        dish: "Chicken Biryani",
        servings: 6,
        mealSlot: "dinner",
        source: "voice",
        rawTranscript: "Naalaikku 6 perukku biryani pannanum.",
      },
    });
    assert.equal(commitMealRes.statusCode, 200);
    const mealCommitData = commitMealRes.json();
    assert.equal(mealCommitData.mealPlan.status, "PLANNED_SHORTAGE");
    assert.equal(mealCommitData.proposedActions.length, 1);

    const proposedAction = mealCommitData.proposedActions[0];
    assert.equal(proposedAction.status, "PENDING_APPROVAL");
    assert.match(proposedAction.title, /800 g Chicken/i);
    assert.match(proposedAction.title, /200 ml Curd/i);

    // 6. Inspect Ripple Graph & "Why?" Evidence
    const rippleRes = await app.inject({
      method: "GET",
      url: `/api/ripples/${mealCommitData.eventId}`,
    });
    assert.equal(rippleRes.statusCode, 200);
    const rippleGraph = rippleRes.json();
    assert.equal(rippleGraph.shortageCount, 2);
    assert.ok(rippleGraph.nodes.length >= 6);
    assert.equal(rippleGraph.explanations.length, 2);
    assert.equal(rippleGraph.explanations[0].deficitDisplay, "800 g");

    // 7. Approve Action -> Executes Snapserve Outbound Call & Reconciles Transcript
    const approveRes = await app.inject({
      method: "POST",
      url: `/api/actions/${proposedAction.id}/approve`,
      payload: {
        userId: "usr_sai_001",
        idempotencyKey: "idem_approve_action_01",
        stepDelayMs: 10, // Fast progression for test
      },
    });
    assert.equal(approveRes.statusCode, 200);
    const approvedData = approveRes.json();
    assert.equal(approvedData.approvalTokenIssued, true);
    assert.equal(approvedData.action.status, "CONFIRMED");
    assert.equal(approvedData.outcome.status, "SUCCESS");
    assert.equal(approvedData.action.callSteps.length, 5); // PREPARING -> CALLING -> CONNECTED -> AWAITING_RESPONSE -> CONFIRMED

    // 8. Verify Incoming Inventory Updated & Meal Shortage Resolved
    const invRes = await app.inject({
      method: "GET",
      url: "/api/inventory",
    });
    assert.equal(invRes.statusCode, 200);
    const invData = invRes.json();
    const chickenAfter = invData.items.find((r: any) => r.id === "res_chicken");
    const curdAfter = invData.items.find((r: any) => r.id === "res_curd");

    assert.equal(chickenAfter.onHandQuantity, 700);
    assert.equal(chickenAfter.reservedQuantity, 1500);
    assert.equal(chickenAfter.incomingQuantity, 800);
    assert.equal(chickenAfter.deficitQuantity, 0);
    assert.equal(chickenAfter.status, "LOW"); // Net available is 0, no longer MISSING!

    assert.equal(curdAfter.onHandQuantity, 200);
    assert.equal(curdAfter.reservedQuantity, 300);
    assert.equal(curdAfter.incomingQuantity, 200);
    assert.equal(curdAfter.deficitQuantity, 0);

    // 9. Verify Dashboard & Timeline Agent Traces
    const timelineRes = await app.inject({
      method: "GET",
      url: "/api/timeline",
    });
    assert.equal(timelineRes.statusCode, 200);
    const timelineData = timelineRes.json();
    assert.ok(timelineData.entries.length >= 4);
    assert.ok(timelineData.agentRuns.length >= 3);

    await app.close();
  });

  it("forks state for counterfactual simulation without mutating canonical state and reconciles physical short-delivery discrepancies", async () => {
    const tempFile = path.join(
      os.tmpdir(),
      `household-counterfactual-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    const store = new HouseholdStore(tempFile);
    const app = buildApiApp(store);

    const versionBefore = store.getState().stateVersion;

    // 1. Run Counterfactual Simulation for 10 guests vs 6 guests baseline
    const cfRes = await app.inject({
      method: "POST",
      url: "/api/ripple/simulate",
      payload: {
        householdId: "hh_demo_001",
        recipeId: "rcp_chicken_biryani",
        servings: 10,
        baselineServings: 6,
      },
    });
    assert.equal(cfRes.statusCode, 200);
    const cfData = cfRes.json();
    assert.equal(cfData.simulatedServings, 10);
    assert.equal(cfData.baselineServings, 6);
    assert.ok(cfData.deltaCostInr > 0);
    assert.ok(cfData.competingMealsAffected.length >= 1); // Onion contention with Vegetable Pulao
    // Canonical state version must not mutate during ephemeral counterfactual simulation
    assert.equal(store.getState().stateVersion, versionBefore);

    // 2. Commit a meal plan so the Ripple Engine proposes a PENDING_APPROVAL vendor action
    const commitMealRes = await app.inject({
      method: "POST",
      url: "/api/meals/commit",
      payload: {
        householdId: "hh_demo_001",
        recipeId: "rcp_chicken_biryani",
        servings: 6,
        mealSlot: "dinner",
        source: "ui",
      },
    });
    assert.equal(commitMealRes.statusCode, 200);
    const pendingAction = commitMealRes.json().proposedActions[0];
    assert.ok(pendingAction);

    const approveRes = await app.inject({
      method: "POST",
      url: `/api/actions/${pendingAction.id}/approve`,
      payload: {
        userId: "usr_sai_001",
        stepDelayMs: 10,
      },
    });
    assert.equal(approveRes.statusCode, 200);

    // 3. Verify Expectations were registered in AWAITING_DELIVERY
    const expRes = await app.inject({
      method: "GET",
      url: "/api/verification/expectations",
    });
    assert.equal(expRes.statusCode, 200);
    const expList = expRes.json().expectations;
    assert.ok(expList.length >= 2);
    assert.equal(expList[0].status, "AWAITING_DELIVERY");

    // 4. Reconcile Physical Delivery with SHORT_DELIVERY (-200g Chicken discrepancy)
    const verifyRes = await app.inject({
      method: "POST",
      url: "/api/verification/reconcile-delivery",
      payload: {
        householdId: "hh_demo_001",
        actionId: pendingAction.id,
        mode: "SHORT_DELIVERY",
      },
    });
    assert.equal(verifyRes.statusCode, 200);
    const verifyData = verifyRes.json();
    assert.equal(verifyData.ok, true);
    assert.equal(verifyData.hasDiscrepancy, true);
    assert.ok(verifyData.followUpActionId);

    // 5. Check State Diffs endpoint
    const diffRes = await app.inject({
      method: "GET",
      url: "/api/state/diff",
    });
    assert.equal(diffRes.statusCode, 200);
    const diffData = diffRes.json();
    assert.ok(diffData.stateVersion > versionBefore);
    assert.ok(diffData.recentTransitions.length > 0);

    await app.close();
  });
});

