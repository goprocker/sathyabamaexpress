import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { buildApiApp } from "../../apps/api/src/app.js";
import { MemoryStateBackend } from "../../apps/api/src/state-backend.js";

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

describe("Per-user households", () => {
  const verifySession = async (token: string) => {
    if (!token.startsWith("user-")) throw new Error("bad token");
    return { userId: token };
  };
  const make = (backend = new MemoryStateBackend()) => {
    const file = path.join(os.tmpdir(), `life-users-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    return { backend, app: buildApiApp(new HouseholdStore(file), { verifySession, stateBackend: backend }) };
  };
  const as = (token: string) => ({ authorization: `Bearer ${token}` });
  type App = ReturnType<typeof make>["app"];

  const inventory = async (a: App, token: string) =>
    (await a.inject({ method: "GET", url: "/api/inventory", headers: as(token) })).json().items as Array<{ name: string }>;

  const scan = (a: App, token: string, name: string) =>
    a.inject({
      method: "POST",
      url: "/api/receipts/confirm",
      headers: as(token),
      payload: { vendorName: "Test Mart", items: [{ canonicalName: name, quantity: 500, unit: "g", confirmed: true }] },
    });

  it("starts every new user with an empty household", async () => {
    const { app: a } = make();
    assert.equal((await inventory(a, "user-new")).length, 0);
    const dash = (await a.inject({ method: "GET", url: "/api/dashboard", headers: as("user-new") })).json();
    assert.equal(dash.todayMeal, null);
    assert.equal(dash.attentionItems.length, 0);
    assert.equal(dash.recentActivity.length, 0);
    const overview = (await a.inject({ method: "GET", url: "/api/life/overview", headers: as("user-new") })).json();
    assert.equal(overview.events.length, 0);
    const notes = (await a.inject({ method: "GET", url: "/api/notifications", headers: as("user-new") })).json();
    assert.equal(notes.unread, 0);
    const recipes = (await a.inject({ method: "GET", url: "/api/life/recipes", headers: as("user-new") })).json().recipes;
    assert.equal(recipes.filter((r: { canMakeNow: boolean }) => r.canMakeNow).length, 0);
    await a.close();
  });

  it("keeps each user's data private", async () => {
    const { app: a } = make();
    assert.equal((await scan(a, "user-a", "Paneer")).statusCode, 200);
    assert.ok((await inventory(a, "user-a")).some((i) => i.name === "Paneer"));
    assert.equal((await inventory(a, "user-b")).length, 0);
    const recent = (await a.inject({ method: "GET", url: "/api/life/receipts/recent", headers: as("user-b") })).json();
    assert.equal(recent.receipts.length, 0);
    await a.close();
  });

  it("saves changes so a restarted server still has them", async () => {
    const { app: first, backend } = make();
    await scan(first, "user-a", "Paneer");
    await first.close();
    const { app: second } = make(backend);
    assert.ok((await inventory(second, "user-a")).some((i) => i.name === "Paneer"));
    await second.close();
  });

  it("resets a user back to empty, not to the demo data", async () => {
    const { app: a } = make();
    await scan(a, "user-a", "Paneer");
    await a.inject({ method: "POST", url: "/api/demo/reset", headers: as("user-a"), payload: {} });
    assert.equal((await inventory(a, "user-a")).length, 0);
    await a.close();
  });

  it("does not touch the shared demo data", async () => {
    const { app: a } = make();
    await scan(a, "user-a", "Paneer");
    const demo = await a.inject({ method: "GET", url: "/api/inventory", headers: as("user-b") });
    assert.equal(demo.json().items.some((i: { name: string }) => i.name === "Paneer"), false);
    await a.close();
  });

  it("rejects a token the verifier refuses", async () => {
    const { app: a } = make();
    const res = await a.inject({ method: "GET", url: "/api/inventory", headers: as("nobody") });
    assert.equal(res.statusCode, 401);
    await a.close();
  });

  it("adds to the cart through the assistant, once per idempotency key, and undoes", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "";
    const a = app();
    const ask = () =>
      a.inject({
        method: "POST",
        url: "/api/life/assistant",
        headers: { "idempotency-key": "ask-bread-1" },
        payload: { question: "add cart bread" },
      });
    const first = (await ask()).json();
    assert.equal(first.answer.actions[0].type, "cart_add");
    assert.equal(first.answer.actions[0].status, "done");
    assert.match(first.answer.text, /Added Bread/);
    await ask();
    const cart = (await a.inject({ method: "GET", url: "/api/cart" })).json();
    const bread = cart.items.filter((c: { name: string }) => c.name === "Bread");
    assert.equal(bread.length, 1);
    assert.equal(bread[0].quantity, 1);
    assert.equal(bread[0].priceUnknown, true);

    const del = await a.inject({ method: "DELETE", url: `/api/cart/items/${bread[0].id}` });
    assert.equal(del.statusCode, 200);
    const after = (await a.inject({ method: "GET", url: "/api/cart" })).json();
    assert.equal(after.items.some((c: { name: string }) => c.name === "Bread"), false);
    await a.close();
    process.env.OPENAI_API_KEY = previous;
  });

  it("validates cart updates", async () => {
    const a = app();
    const bad = await a.inject({ method: "POST", url: "/api/cart/items", payload: { name: "" } });
    assert.equal(bad.statusCode, 400);
    const missing = await a.inject({ method: "PATCH", url: "/api/cart/items/nope", payload: { quantity: 2 } });
    assert.equal(missing.statusCode, 404);
    await a.close();
  });
});

describe("Signed-in server behaviour", () => {
  const verifySession = async (token: string) => {
    if (!token.startsWith("user-")) throw Object.assign(new Error("nope"), { reason: "token-invalid" });
    return { userId: token };
  };
  const file = () => path.join(os.tmpdir(), `life-srv-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const as = (token: string) => ({ authorization: `Bearer ${token}` });

  it("gives simultaneous first requests the same household", async () => {
    // A cacheable backend that counts loads, like the local file backend.
    class CountingBackend extends MemoryStateBackend {
      loads = 0;
      override readonly cacheable = true;
      override async load(userId: string) {
        this.loads += 1;
        await new Promise((r) => setTimeout(r, 20));
        return super.load(userId);
      }
    }
    const backend = new CountingBackend();
    const a = buildApiApp(new HouseholdStore(file()), { verifySession, stateBackend: backend });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => a.inject({ method: "GET", url: "/api/inventory", headers: as("user-race") })),
    );
    assert.ok(results.every((r) => r.statusCode === 200));
    assert.equal(backend.loads, 1);
    await a.close();
  });

  it("reports a storage failure as 503, not as an expired session", async () => {
    class BrokenBackend extends MemoryStateBackend {
      override async load(): Promise<never> {
        throw new Error("database down");
      }
    }
    const a = buildApiApp(new HouseholdStore(file()), { verifySession, stateBackend: new BrokenBackend() });
    const res = await a.inject({ method: "GET", url: "/api/inventory", headers: as("user-x") });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().code, "storage");
    const bad = await a.inject({ method: "GET", url: "/api/inventory", headers: as("nobody") });
    assert.equal(bad.statusCode, 401);
    assert.equal(bad.json().code, "session");
    await a.close();
  });

  it("says how it is configured on the public health check", async () => {
    const a = buildApiApp(new HouseholdStore(file()), { verifySession, stateBackend: new MemoryStateBackend() });
    const res = await a.inject({ method: "GET", url: "/api/health" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().config.auth, "enforced");
    await a.close();
    const open = buildApiApp(new HouseholdStore(file()));
    assert.match((await open.inject({ method: "GET", url: "/api/health" })).json().config.auth, /^open/);
    await open.close();
  });
});
