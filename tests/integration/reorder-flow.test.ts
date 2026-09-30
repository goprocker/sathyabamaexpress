import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { buildApiApp } from "../../apps/api/src/app.js";
import { MemoryStateBackend } from "../../apps/api/src/state-backend.js";
import { UserStores } from "../../apps/api/src/user-stores.js";
import { startReorderScheduler } from "../../apps/api/src/reorder-scheduler.js";
import { currentUser } from "../../apps/api/src/request-context.js";

// Hermetic: the Snapserve simulator, no OpenAI.
process.env.SNAPSERVE_MODE = "simulated";
process.env.OPENAI_API_KEY = "";

function app() {
  const file = path.join(os.tmpdir(), `reorder-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const store = new HouseholdStore(file);
  return { store, app: buildApiApp(store) };
}

type ApiAction = {
  id: string;
  origin?: string | null;
  status: string;
  items: Array<{ resourceId: string; orderQuantity: number }>;
  targetVendor?: { id: string };
  evidenceLines?: Array<{ name: string }>;
};

const reorders = (actions: ApiAction[]) => actions.filter((a) => a.origin === "INVENTORY_REORDER");

describe("inventory restock → vendor call", () => {
  it("proposes one approval-ready call per vendor for expiring, low and out-of-stock items", async () => {
    const { app: a } = app();
    const res = await a.inject({ method: "GET", url: "/api/actions" });
    assert.equal(res.statusCode, 200);
    const proposed = reorders(res.json().actions);
    assert.ok(proposed.length >= 1, "the demo pantry has expiring items");
    for (const p of proposed) {
      assert.equal(p.status, "PENDING_APPROVAL");
      assert.ok(p.items.length > 0 && p.targetVendor?.id);
      assert.equal(p.evidenceLines?.length, p.items.length, "every item carries its own evidence");
    }
    const vendorIds = proposed.map((p) => p.targetVendor?.id);
    assert.equal(new Set(vendorIds).size, vendorIds.length, "one proposal per vendor");
    await a.close();
  });

  it("does not duplicate proposals on rescans", async () => {
    const { app: a } = app();
    const first = (await a.inject({ method: "POST", url: "/api/reorders/scan" })).json();
    const second = (await a.inject({ method: "POST", url: "/api/reorders/scan" })).json();
    assert.ok(first.created.length >= 1);
    assert.equal(second.created.length, 0);
    assert.deepEqual(
      second.pending.map((p: ApiAction) => p.id).sort(),
      first.pending.map((p: ApiAction) => p.id).sort(),
    );
    await a.close();
  });

  it("approving places exactly one call and books the stock as incoming", async () => {
    const { store, app: a } = app();
    const [proposal] = reorders((await a.inject({ method: "GET", url: "/api/actions" })).json().actions);
    assert.ok(proposal);
    const incomingBefore = new Map(store.getState().resources.map((r) => [r.id, r.incomingQuantity]));

    const approved = await a.inject({
      method: "POST",
      url: `/api/actions/${proposal.id}/approve`,
      payload: { stepDelayMs: 0 },
    });
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.json().action.status, "CONFIRMED");

    // A repeat approval (double tap, the old UI's /complete) must not dial again.
    const runsBefore = store.getState().agentRuns.length;
    const again = await a.inject({ method: "POST", url: `/api/actions/${proposal.id}/complete`, payload: {} });
    assert.equal(again.json().alreadyProcessed, true);
    assert.equal(store.getState().agentRuns.length, runsBefore);

    for (const item of proposal.items) {
      const after = store.getState().resources.find((r) => r.id === item.resourceId)?.incomingQuantity ?? 0;
      assert.equal(after, (incomingBefore.get(item.resourceId) ?? 0) + item.orderQuantity);
    }
    // Now covered by incoming stock, so the next scan leaves those items alone.
    const next = (await a.inject({ method: "POST", url: "/api/reorders/scan" })).json();
    const reproposed = next.created.flatMap((p: ApiAction) => p.items.map((i) => i.resourceId));
    for (const item of proposal.items) assert.ok(!reproposed.includes(item.resourceId));
    await a.close();
  });

  it("a rejected restock is not proposed again straight away", async () => {
    const { app: a } = app();
    const [proposal] = reorders((await a.inject({ method: "GET", url: "/api/actions" })).json().actions);
    assert.ok(proposal);
    await a.inject({ method: "POST", url: `/api/actions/${proposal.id}/reject`, payload: {} });
    const next = (await a.inject({ method: "POST", url: "/api/reorders/scan" })).json();
    const reproposed = next.created.flatMap((p: ApiAction) => p.items.map((i) => i.resourceId));
    for (const item of proposal.items) assert.ok(!reproposed.includes(item.resourceId));
    await a.close();
  });

  it("the scheduled check visits every signed-in household in its own context", async () => {
    const backend = new MemoryStateBackend();
    const userStores = new UserStores(backend);
    await userStores.get("user_a");
    await userStores.get("user_b");
    await userStores.flush("user_a");
    await userStores.flush("user_b");

    const seen: string[] = [];
    const stop = startReorderScheduler({
      intervalMs: 20,
      userStores,
      check: async () => {
        seen.push(currentUser()?.userId ?? "none");
      },
    });
    await new Promise((r) => setTimeout(r, 60));
    stop();
    assert.ok(seen.includes("user_a") && seen.includes("user_b"));
    assert.ok(!seen.includes("none"));
  });
});
