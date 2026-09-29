// TRD §16 evals — voice intent robustness (offline deterministic fallback).
// Drives POST /api/voice/transcribe with transcriptOverride (no provider keys)
// and asserts structured intent + deterministic simulation deficits.
// Seed: Chicken 700g on-hand (250g/serving), Curd 200ml on-hand (50ml/serving).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { buildApiApp } from "../../apps/api/src/app.js";

interface VoiceBody {
  structuredIntent: {
    intent: string;
    dish: string;
    recipeId: string;
    servings: number;
    dateLabel: string;
    mealSlot: string;
  };
  simulation?: {
    servings: number;
    shortageCount: number;
    ingredients: Array<{ name: string; deficitQty: number }>;
  };
}

describe("Evals — 10 voice utterances (Tamil / Tanglish / English)", () => {
  let app: ReturnType<typeof buildApiApp>;

  before(async () => {
    const tempFile = path.join(
      os.tmpdir(),
      `household-eval-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    const store = new HouseholdStore(tempFile);
    app = buildApiApp(store);
    const resetRes = await app.inject({
      method: "POST",
      url: "/api/demo/reset",
      payload: { householdId: "hh_demo_001" },
    });
    assert.equal(resetRes.statusCode, 200);
  });

  async function transcribe(transcriptOverride: string): Promise<VoiceBody> {
    const res = await app.inject({
      method: "POST",
      url: "/api/voice/transcribe",
      payload: {
        householdId: "hh_demo_001",
        transcriptOverride,
        autoSimulate: true,
        autoCommit: false,
      },
    });
    assert.equal(res.statusCode, 200);
    return res.json() as VoiceBody;
  }

  function deficitOf(body: VoiceBody, name: string): number {
    const ing = body.simulation?.ingredients.find((i) => i.name === name);
    assert.ok(ing, `expected ingredient ${name} in simulation`);
    return ing.deficitQty;
  }

  it("V1 Tanglish canonical → Biryani × 6, 800g chicken + 100ml curd short", async () => {
    const body = await transcribe("Naalaikku 6 perukku biryani pannanum.");
    assert.equal(body.structuredIntent.intent, "MEAL_PLANNED");
    assert.equal(body.structuredIntent.recipeId, "rcp_chicken_biryani");
    assert.equal(body.structuredIntent.servings, 6);
    assert.equal(body.structuredIntent.dateLabel, "Tomorrow");
    assert.equal(deficitOf(body, "Chicken"), 800);
    assert.equal(deficitOf(body, "Curd"), 100);
  });

  it("V2 Tanglish spelling variant → Biryani × 4, 300g chicken short, curd covered", async () => {
    const body = await transcribe("Naalaiku 4 perku chicken biryani seiyanum");
    assert.equal(body.structuredIntent.recipeId, "rcp_chicken_biryani");
    assert.equal(body.structuredIntent.servings, 4);
    assert.equal(deficitOf(body, "Chicken"), 300);
    assert.equal(deficitOf(body, "Curd"), 0);
  });

  it("V3 English → Biryani × 6 tomorrow dinner", async () => {
    const body = await transcribe("Plan biryani for 6 people tomorrow");
    assert.equal(body.structuredIntent.recipeId, "rcp_chicken_biryani");
    assert.equal(body.structuredIntent.servings, 6);
    assert.equal(body.structuredIntent.dateLabel, "Tomorrow");
    assert.equal(body.structuredIntent.mealSlot, "dinner");
    assert.equal(deficitOf(body, "Chicken"), 800);
  });

  it("V4 English word-number falls back to default 6 servings", async () => {
    const body = await transcribe("Cook chicken biryani for six tomorrow evening");
    assert.equal(body.structuredIntent.recipeId, "rcp_chicken_biryani");
    assert.equal(body.structuredIntent.servings, 6);
  });

  it("V5 Tamil script → Biryani × 6 tomorrow", async () => {
    const body = await transcribe("நாளைக்கு 6 பேருக்கு பிரியாணி பண்ணணும்");
    assert.equal(body.structuredIntent.recipeId, "rcp_chicken_biryani");
    assert.equal(body.structuredIntent.servings, 6);
    assert.equal(body.structuredIntent.dateLabel, "Tomorrow");
    assert.equal(deficitOf(body, "Chicken"), 800);
  });

  it("V6 scaled × 8 → 1300g chicken + 200ml curd short", async () => {
    const body = await transcribe("Naalaikku 8 perukku biryani pannanum");
    assert.equal(body.structuredIntent.servings, 8);
    assert.equal(deficitOf(body, "Chicken"), 1300);
    assert.equal(deficitOf(body, "Curd"), 200);
  });

  it("V7 sambar → Sambar Rice × 4 lunch", async () => {
    const body = await transcribe("Tomorrow lunch sambar rice for 4");
    assert.equal(body.structuredIntent.recipeId, "rcp_sambar_rice");
    assert.equal(body.structuredIntent.servings, 4);
    assert.equal(body.structuredIntent.mealSlot, "lunch");
  });

  it("V8 kulambu → Chicken Curry × 3", async () => {
    const body = await transcribe("Naalaikku 3 perukku chicken kulambu vekanum");
    assert.equal(body.structuredIntent.recipeId, "rcp_chicken_curry");
    assert.equal(body.structuredIntent.servings, 3);
  });

  it("V9 uppercase + punctuation noise → Biryani × 6", async () => {
    const body = await transcribe("NAALAIKKU 6 PERUKKU BIRYANI PANNANUM!!!");
    assert.equal(body.structuredIntent.recipeId, "rcp_chicken_biryani");
    assert.equal(body.structuredIntent.servings, 6);
  });

  it("V10 morning slot → Biryani × 2 breakfast", async () => {
    const body = await transcribe("Tomorrow morning biryani for 2");
    assert.equal(body.structuredIntent.servings, 2);
    assert.equal(body.structuredIntent.mealSlot, "breakfast");
    assert.equal(deficitOf(body, "Chicken"), 0);
  });
});
