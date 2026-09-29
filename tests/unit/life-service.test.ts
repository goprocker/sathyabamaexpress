import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LifeService,
  addDays,
  budgetData,
  chargePlan,
  leaveBy,
  smartCart,
  todayIso,
  weeklyMealPlan,
  type LifeInputs,
} from "@household/life";

function inputs(): LifeInputs {
  const today = todayIso();
  return {
    obligations: [
      { id: "o1", domain: "bill", title: "Electricity", provider: "TNEB", detail: "", dueDate: addDays(today, 6), amount: "₹2,140", status: "due_soon" },
      { id: "o2", domain: "bill", title: "Broadband", provider: "ACT", detail: "", dueDate: addDays(today, 8), amount: "₹799", status: "due_soon" },
    ],
    forecasts: [],
    inventory: [{ id: "r1", name: "Milk", quantity: 0.4, unit: "L", daysRemaining: 1 }],
    cart: smartCart,
    weekly: weeklyMealPlan,
  };
}

describe("LifeService", () => {
  it("flags a collision when bills cluster around the trip", () => {
    const svc = new LifeService(inputs);
    const { collisions } = svc.overview();
    assert.ok(collisions.length >= 1);
    assert.ok(collisions[0]?.advice.some((a) => a.includes("Electricity")));
  });

  it("learns from repeated rejections by down-ranking that kind", () => {
    const svc = new LifeService(inputs);
    const before = svc.overview().suggestions.find((s) => s.kind === "mobility");
    assert.ok(before);
    svc.decide("a", "mobility", "rejected");
    svc.decide("b", "mobility", "rejected");
    const after = svc.overview().suggestions.find((s) => s.id === before.id);
    assert.ok(after);
    assert.equal(after.score, before.score - 24);
    svc.resetLearning();
    assert.equal(svc.overview().rejections, 0);
  });

  it("removes a decided suggestion from the ranked list", () => {
    const svc = new LifeService(inputs);
    const first = svc.overview().suggestions[0];
    assert.ok(first);
    svc.decide(first.id, first.kind, "accepted");
    assert.ok(!svc.overview().suggestions.some((s) => s.id === first.id));
  });

  it("computes departure time and charge plan deterministically", () => {
    assert.equal(leaveBy("10:00", "ev"), "09:07");
    const plan = chargePlan(58, 80);
    assert.equal(plan.pct, 22);
    assert.ok(Math.abs(plan.kwh - 8.91) < 0.01);
    assert.equal(new LifeService(inputs).chargePlan(50).target, 58);
  });

  it("toggles trip sharing idempotently and ignores unknown contacts", () => {
    const svc = new LifeService(inputs);
    svc.setTripSharing("c1", true);
    svc.setTripSharing("c1", true);
    svc.setTripSharing("nope", true);
    assert.deepEqual(svc.mobility().sharing, ["c1"]);
    svc.setTripSharing("c1", false);
    assert.deepEqual(svc.mobility().sharing, []);
  });

  it("wardrobe first: covered outfit costs nothing, deselecting shows the gap", () => {
    const svc = new LifeService(inputs);
    const covered = svc.occasionPlan({ Ethnic: "w1", Accessory: "w7" });
    assert.equal(covered.covered, true);
    assert.equal(covered.options[0]?.value, 0);
    const gap = svc.occasionPlan({ Ethnic: null, Accessory: "w7" });
    assert.equal(gap.missingCount, 1);
    assert.equal(gap.options[0]?.value, null);
    assert.ok((gap.options[2]?.value ?? 0) > 0);
  });

  it("clamps impact factors and recomputes the estimate", () => {
    const svc = new LifeService(inputs);
    svc.setFactors({ garment: 99, household: -5 });
    assert.deepEqual(svc.state.factors, { garment: 20, household: 0 });
    assert.equal(svc.circular().co2Saved, 3 * 20);
  });

  it("answers questions from the user's own data with sources", () => {
    const svc = new LifeService(inputs);
    const a = svc.ask("What groceries are running low?");
    assert.ok(a.bullets?.some((b) => b.startsWith("Milk")));
    assert.ok(a.sources.length > 0);
    assert.equal(svc.ask("gibberish qqq").sources.length, 0);
  });

  it("keeps the budget sample internally consistent", () => {
    assert.equal(budgetData.monthlyBudget - budgetData.spent, budgetData.remaining);
  });
});
