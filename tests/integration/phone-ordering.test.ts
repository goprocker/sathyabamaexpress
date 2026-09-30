import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { runVoiceOrderWorkflow } from "@household/agents";
import type { SnapserveCallListItem } from "@household/integrations";
import { buildApiApp } from "../../apps/api/src/app.js";
import { startPhoneOrderWatcher } from "../../apps/api/src/phone-orders.js";

// Hermetic: Snapserve simulator, no OpenAI.
process.env.SNAPSERVE_MODE = "simulated";
process.env.OPENAI_API_KEY = "";

const newStore = () =>
  new HouseholdStore(path.join(os.tmpdir(), `phone-order-${Date.now()}-${Math.random().toString(36).slice(2)}.json`));

async function onboard(a: ReturnType<typeof buildApiApp>) {
  const add = await a.inject({
    method: "POST",
    url: "/api/vendors",
    payload: { name: "Aavin Milk Booth", phone: "98400 11111", categories: ["dairy"] },
  });
  assert.equal(add.statusCode, 201);
  return add.json().vendor as { id: string; phoneE164: string };
}

describe("stores", () => {
  it("onboards, updates and removes a store", async () => {
    const a = buildApiApp(newStore());
    const vendor = await onboard(a);
    assert.equal(vendor.phoneE164, "+919840011111");

    const dup = await a.inject({ method: "POST", url: "/api/vendors", payload: { name: "Copy", phone: "+91 98400 11111", categories: ["dairy"] } });
    assert.equal(dup.statusCode, 409);
    const bad = await a.inject({ method: "POST", url: "/api/vendors", payload: { name: "X shop", phone: "12345678", categories: ["dairy"] } });
    assert.equal(bad.statusCode, 400);

    const made = await a.inject({ method: "PATCH", url: `/api/vendors/${vendor.id}`, payload: { isPreferred: true } });
    assert.equal(made.json().vendor.isPreferred, true);
    const vendors = (await a.inject({ method: "GET", url: "/api/vendors" })).json().vendors as Array<{ id: string; isPreferred: boolean }>;
    assert.equal(vendors.filter((v) => v.isPreferred).length, 1, "only one default store");

    assert.equal((await a.inject({ method: "DELETE", url: `/api/vendors/${vendor.id}` })).statusCode, 200);
    const after = (await a.inject({ method: "GET", url: "/api/vendors" })).json().vendors as Array<{ id: string; isPreferred: boolean }>;
    assert.ok(!after.some((v) => v.id === vendor.id));
    assert.ok(after.length === 0 || after.some((v) => v.isPreferred), "a default store remains");
    await a.close();
  });

  it("registers the phone allowed to order", async () => {
    const a = buildApiApp(newStore());
    const set = await a.inject({ method: "PUT", url: "/api/ordering/phone", payload: { phone: "93440 97020" } });
    assert.equal(set.json().ownerPhone, "+919344097020");
    assert.equal((await a.inject({ method: "GET", url: "/api/ordering" })).json().ownerPhone, "+919344097020");
    await a.close();
  });
});

describe("ordering", () => {
  it("an order from the app calls the right store and books tracked items as incoming", async () => {
    const store = newStore();
    const a = buildApiApp(store);
    const vendor = await onboard(a);
    const curdBefore = store.getState().resources.find((r) => r.id === "res_curd")?.incomingQuantity ?? 0;

    const res = await a.inject({ method: "POST", url: "/api/orders", payload: { items: "1 litre curd", store: "Aavin" } });
    assert.equal(res.statusCode, 200);
    const [action] = res.json().actions as Array<{ status: string; targetVendor: { id: string }; origin: string }>;
    assert.equal(action?.origin, "VOICE_ORDER");
    assert.equal(action?.targetVendor.id, vendor.id);
    assert.equal(action?.status, "CONFIRMED");
    const curdAfter = store.getState().resources.find((r) => r.id === "res_curd")?.incomingQuantity ?? 0;
    assert.equal(curdAfter, curdBefore + 1000);
    await a.close();
  });

  it("explains when nothing can be ordered", async () => {
    const a = buildApiApp(newStore());
    const res = await a.inject({ method: "POST", url: "/api/orders", payload: { items: "??" } });
    assert.equal(res.statusCode, 422);
    await a.close();
  });

  it("the same call is never ordered twice", async () => {
    const store = newStore();
    const input = { callId: "42", callerPhone: "+919344097020", orderText: "2 kg rice", approverUserId: "usr_sai_001", stepDelayMs: 0 };
    const first = await runVoiceOrderWorkflow(store, input);
    const second = await runVoiceOrderWorkflow(store, input);
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(store.getState().actions.filter((x) => x.sourceEventId === "evt_call_42").length, first.actions.length);
  });
});

describe("phone order watcher", () => {
  const call = (id: string, fromNumber: string): SnapserveCallListItem => ({
    id,
    agentId: 1356,
    status: "completed",
    direction: "inbound",
    fromNumber,
    toNumber: "+918071581642",
    transcript: null,
    callSummary: null,
    disposition: { order_items: "2 kg rice", order_confirmed: true },
    createdAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
  });

  it("orders only for calls from the registered phone, once per call", async () => {
    const store = newStore();
    const a = buildApiApp(store);
    await a.inject({ method: "PUT", url: "/api/ordering/phone", payload: { phone: "+919344097020" } });

    const placed: string[] = [];
    const calls = [call("100", "+919344097020"), call("101", "+919999999999")];
    const stop = startPhoneOrderWatcher({
      agentId: 1356,
      intervalMs: 20,
      listCalls: async () => calls,
      demoStore: store,
      userStores: null,
      placeOrder: async (householdStore, approver, c, order) => {
        placed.push(c.id);
        await runVoiceOrderWorkflow(householdStore, {
          callId: c.id,
          callerPhone: c.fromNumber ?? "",
          orderText: order.orderText,
          approverUserId: approver,
          stepDelayMs: 0,
        });
      },
    });
    const ordersFor100 = () => store.getState().actions.filter((x) => x.sourceEventId === "evt_call_100");
    for (let i = 0; i < 100; i++) {
      const o = ordersFor100();
      if (o.length && o.every((x) => x.status === "CONFIRMED" || x.status === "FAILED")) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    stop();

    assert.deepEqual(placed, ["100"], "the stranger's call is ignored and each call runs once");
    const ordered = ordersFor100();
    assert.ok(ordered.length >= 1);
    assert.ok(ordered.every((x) => x.status === "CONFIRMED"));
    await a.close();
  });
});
