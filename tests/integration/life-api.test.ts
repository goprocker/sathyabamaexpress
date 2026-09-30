import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { buildApiApp } from "../../apps/api/src/app.js";

function app() {
  const file = path.join(os.tmpdir(), `life-api-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  return buildApiApp(new HouseholdStore(file));
}

describe("LIVORA API routes", () => {
  it("serves overview built from the canonical store", async () => {
    const a = app();
    const res = await a.inject({ method: "GET", url: "/api/life/overview" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.events) && body.events.length > 0);
    assert.ok(Array.isArray(body.suggestions));
    await a.close();
  });

  it("rejects invalid bodies with 400, not 500", async () => {
    const a = app();
    const res = await a.inject({ method: "POST", url: "/api/life/assistant", payload: {} });
    assert.equal(res.statusCode, 400);
    const bad = await a.inject({ method: "GET", url: "/api/mobility/leave-by?arrival=99&mode=jetpack" });
    assert.equal(bad.statusCode, 400);
    await a.close();
  });

  it("persists a decision and resets with the demo reset", async () => {
    const a = app();
    await a.inject({
      method: "POST",
      url: "/api/life/decisions",
      payload: { suggestionId: "sg_leave", kind: "mobility", decision: "rejected" },
    });
    const after = (await a.inject({ method: "GET", url: "/api/life/overview" })).json();
    assert.equal(after.rejections, 1);
    await a.inject({ method: "POST", url: "/api/demo/reset", payload: {} });
    const reset = (await a.inject({ method: "GET", url: "/api/life/overview" })).json();
    assert.equal(reset.rejections, 0);
    await a.close();
  });

  it("deduplicates wardrobe creation by Idempotency-Key", async () => {
    const a = app();
    const send = () =>
      a.inject({
        method: "POST",
        url: "/api/circular/wardrobe",
        headers: { "idempotency-key": "k-1" },
        payload: { name: "Silk stole", category: "Accessory", occasion: "Wedding" },
      });
    const first = await send();
    const second = await send();
    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 200);
    const circular = (await a.inject({ method: "GET", url: "/api/circular" })).json();
    assert.equal(circular.wardrobe.filter((w: { name: string }) => w.name === "Silk stole").length, 1);
    await a.close();
  });
});

describe("Recipes and inventory", () => {
  type RecipeView = {
    id: string;
    image: string;
    canMakeNow: boolean;
    missing: string[];
    ingredients: Array<{ name: string; enough: boolean; shortBy: number }>;
  };

  const recipes = async (a: ReturnType<typeof app>, servings = 4) =>
    (await a.inject({ method: "GET", url: `/api/life/recipes?servings=${servings}` })).json().recipes as RecipeView[];

  const riceGrams = async (a: ReturnType<typeof app>) => {
    const items = (await a.inject({ method: "GET", url: "/api/inventory" })).json().items as Array<{
      id: string;
      onHandQuantity: number;
    }>;
    return items.find((i) => i.id === "res_rice")?.onHandQuantity;
  };

  it("serves a large catalogue with a photo for every recipe", async () => {
    const a = app();
    const list = await recipes(a);
    assert.ok(list.length >= 50);
    assert.equal(new Set(list.map((r) => r.id)).size, list.length);
    assert.ok(list.every((r) => r.image.startsWith("https://commons.wikimedia.org/wiki/Special:FilePath/")));
    await a.close();
  });

  it("checks pantry quantity, not just presence, and scales by servings", async () => {
    const a = app();
    const biryani = (await recipes(a, 4)).find((r) => r.id === "chicken-biryani");
    assert.equal(biryani?.canMakeNow, false);
    assert.deepEqual(biryani?.missing, ["Chicken"]);
    const two = (await recipes(a, 2)).find((r) => r.id === "chicken-biryani");
    assert.equal(two?.canMakeNow, true);
    await a.close();
  });

  it("refuses to prepare when short and leaves inventory untouched", async () => {
    const a = app();
    const before = await riceGrams(a);
    const res = await a.inject({ method: "POST", url: "/api/life/recipes/chicken-biryani/prepare", payload: {} });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().shortfalls[0].name, "Chicken");
    assert.equal(await riceGrams(a), before);
    await a.close();
  });

  it("deducts stock once per idempotency key and 404s unknown recipes", async () => {
    const a = app();
    const before = (await riceGrams(a)) ?? 0;
    const payload = { idempotencyKey: "cook-jeera-1" };
    const first = await a.inject({ method: "POST", url: "/api/life/recipes/jeera-rice/prepare", payload });
    assert.equal(first.statusCode, 200);
    assert.equal(await riceGrams(a), before - 300);
    const repeat = await a.inject({ method: "POST", url: "/api/life/recipes/jeera-rice/prepare", payload });
    assert.equal(repeat.json().eventId, first.json().eventId);
    assert.equal(await riceGrams(a), before - 300);
    const missing = await a.inject({ method: "POST", url: "/api/life/recipes/nope/prepare", payload: {} });
    assert.equal(missing.statusCode, 404);
    await a.close();
  });

  it("prepares with what is available when partial is allowed", async () => {
    const a = app();
    const res = await a.inject({
      method: "POST",
      url: "/api/life/recipes/chicken-biryani/prepare",
      payload: { allowPartial: true },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().shortfalls[0].name, "Chicken");
    assert.ok(res.json().consumed.some((c: { name: string }) => c.name === "Chicken"));
    await a.close();
  });

  it("a confirmed bill adds stock that unlocks recipes", async () => {
    const a = app();
    const before = (await recipes(a)).find((r) => r.id === "paneer-butter-masala");
    assert.equal(before?.canMakeNow, false);
    const confirm = await a.inject({
      method: "POST",
      url: "/api/receipts/confirm",
      payload: {
        vendorName: "Test Mart",
        items: [
          { canonicalName: "Paneer", quantity: 500, unit: "g", confirmed: true },
          { canonicalName: "Butter", quantity: 200, unit: "g", confirmed: true },
          { canonicalName: "Cream", quantity: 200, unit: "ml", confirmed: true },
          { canonicalName: "Cashew", quantity: 100, unit: "g", confirmed: true },
        ],
      },
    });
    assert.equal(confirm.statusCode, 200);
    const after = (await recipes(a)).find((r) => r.id === "paneer-butter-masala");
    assert.equal(after?.canMakeNow, true);
    const recent = (await a.inject({ method: "GET", url: "/api/life/receipts/recent" })).json().receipts;
    assert.ok(recent.some((r: { vendor: string }) => r.vendor === "Test Mart"));
    await a.close();
  });
});

describe("Clerk auth guard", () => {
  const guarded = () => {
    const file = path.join(os.tmpdir(), `life-auth-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    return buildApiApp(new HouseholdStore(file), { clerkSecretKey: "sk_test_dummy" });
  };

  it("rejects requests without a session token and keeps health public", async () => {
    const a = guarded();
    const noToken = await a.inject({ method: "GET", url: "/api/life/recipes" });
    assert.equal(noToken.statusCode, 401);
    const health = await a.inject({ method: "GET", url: "/api/health" });
    assert.equal(health.statusCode, 200);
    await a.close();
  });

  it("rejects an invalid token and does not run the handler", async () => {
    const a = guarded();
    const res = await a.inject({
      method: "POST",
      url: "/api/life/recipes/jeera-rice/prepare",
      headers: { authorization: "Bearer not-a-real-token" },
      payload: {},
    });
    assert.equal(res.statusCode, 401);
    await a.close();
  });

  it("leaves the signed webhook route to its own signature check", async () => {
    const a = guarded();
    const res = await a.inject({ method: "POST", url: "/api/webhooks/snapserve", payload: {} });
    // Reaches the webhook handler (which rejects the bad signature itself) instead of the session guard.
    assert.notEqual(res.json().error, "Sign in required.");
    await a.close();
  });
});
