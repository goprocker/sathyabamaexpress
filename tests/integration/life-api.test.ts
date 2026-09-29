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
