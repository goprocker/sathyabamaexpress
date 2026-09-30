import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { buildApiApp } from "../../apps/api/src/app.js";

// Hermetic: Snapserve simulator, no OpenAI.
process.env.SNAPSERVE_MODE = "simulated";
process.env.OPENAI_API_KEY = "";

/** The demo kitchen with every shelf emptied and no stores: "our inventory is empty". */
function emptyKitchen() {
  const store = new HouseholdStore(path.join(os.tmpdir(), `short-${Date.now()}-${Math.random().toString(36).slice(2)}.json`));
  store.mutate((d) => {
    for (const r of d.resources) {
      r.onHandQuantity = 0;
      r.reservedQuantity = 0;
      r.incomingQuantity = 0;
    }
    d.lots = [];
    d.vendors = [];
    d.actions = [];
  });
  return store;
}

const planBiryani = (a: ReturnType<typeof buildApiApp>) =>
  a.inject({
    method: "POST",
    url: "/api/meals/commit",
    payload: { householdId: "hh_demo_001", recipeId: "rcp_chicken_biryani", servings: 6, mealSlot: "dinner", source: "ui" },
  });

type Order = { id: string; vendor: string; status: string; items: Array<{ resourceId: string }>; targetVendor?: { id: string } };

describe("ripple shortage → store call", () => {
  it("with no stores, nothing is called and the screen asks for a store", async () => {
    const a = buildApiApp(emptyKitchen());
    assert.equal((await planBiryani(a)).statusCode, 200);
    const res = (await a.inject({ method: "GET", url: "/api/shortage-orders" })).json();
    assert.equal(res.orders.length, 0, "no order to a made-up number");
    assert.ok(res.missingStore.length > 0);
    await a.close();
  });

  it("routes each short item to the store that sells it and one tap calls it", async () => {
    const store = emptyKitchen();
    const a = buildApiApp(store);
    await a.inject({ method: "POST", url: "/api/vendors", payload: { name: "Nellai Meats", phone: "98400 22222", categories: ["protein"] } });
    await a.inject({ method: "POST", url: "/api/vendors", payload: { name: "Aavin Booth", phone: "98400 33333", categories: ["dairy"] } });
    await a.inject({ method: "POST", url: "/api/vendors", payload: { name: "Anna Stores", phone: "98400 44444", categories: ["grain", "spice", "pantry", "produce"] } });
    assert.equal((await planBiryani(a)).statusCode, 200);

    const res = (await a.inject({ method: "GET", url: "/api/shortage-orders" })).json() as { orders: Order[]; missingStore: unknown[] };
    const byVendor = Object.fromEntries(res.orders.map((o) => [o.vendor, o.items.map((i) => i.resourceId)]));
    assert.ok(byVendor["Nellai Meats"]?.includes("res_chicken"), "chicken from the meat shop");
    assert.ok(byVendor["Aavin Booth"]?.includes("res_curd"), "curd from the milk booth");
    assert.ok(byVendor["Anna Stores"]?.includes("res_rice"), "rice from the grocery");
    assert.deepEqual(res.missingStore, []);
    assert.ok(res.orders.every((o) => o.status === "PENDING_APPROVAL"), "each waits for one tap");

    // A second look doesn't duplicate anything.
    const again = (await a.inject({ method: "GET", url: "/api/shortage-orders" })).json() as { orders: Order[] };
    assert.equal(again.orders.length, res.orders.length);

    const meat = res.orders.find((o) => o.vendor === "Nellai Meats");
    assert.ok(meat);
    const called = await a.inject({ method: "POST", url: `/api/actions/${meat.id}/approve`, payload: { stepDelayMs: 0 } });
    assert.equal(called.json().action.status, "CONFIRMED");
    const chicken = store.getState().resources.find((r) => r.id === "res_chicken");
    assert.ok((chicken?.incomingQuantity ?? 0) > 0, "confirmed order is on its way home");
    await a.close();
  });

  it("adding a store after planning prepares its order", async () => {
    const a = buildApiApp(emptyKitchen());
    await planBiryani(a);
    await a.inject({ method: "POST", url: "/api/vendors", payload: { name: "Aavin Booth", phone: "98400 33333", categories: ["dairy"] } });
    const res = (await a.inject({ method: "GET", url: "/api/shortage-orders" })).json() as { orders: Order[] };
    assert.ok(res.orders.some((o) => o.vendor === "Aavin Booth" && o.items.some((i) => i.resourceId === "res_curd")));
    await a.close();
  });
});
