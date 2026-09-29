// TRD §16 evals — receipt extraction + confidence gating (offline fallback).
// PRD §7.1: confidence ≥ 0.85 pre-checked, < 0.85 flagged for mandatory review.
// Canonical receipt: Rice 5kg 0.98, Chicken 700g 0.95, Onion 2kg 0.94,
// Curd 200ml 0.74 (low → needsReview).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { buildApiApp } from "../../apps/api/src/app.js";

interface ExtractedItem {
  name: string;
  canonicalName: string;
  quantity: number;
  unit: string;
  confidence?: number;
  confidenceScore?: number;
  confidenceLabel?: "high" | "low";
  needsReview?: boolean;
}

interface ExtractBody {
  receiptId: string;
  items: ExtractedItem[];
  needsReviewCount: number;
  usedProvider?: string;
}

describe("Evals — 3 receipt extraction cases", () => {
  let app: ReturnType<typeof buildApiApp>;

  before(async () => {
    const tempFile = path.join(
      os.tmpdir(),
      `household-eval-receipt-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
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

  async function extract(payload: Record<string, unknown>): Promise<ExtractBody> {
    const res = await app.inject({
      method: "POST",
      url: "/api/receipts/extract",
      payload: { householdId: "hh_demo_001", ...payload },
    });
    assert.equal(res.statusCode, 200);
    return res.json() as ExtractBody;
  }

  it("R1 canonical receipt → 4 items, only Curd flagged (0.74 < 0.85)", async () => {
    const body = await extract({});
    assert.equal(body.items.length, 4);
    assert.equal(body.needsReviewCount, 1);

    const byName = (n: string) => body.items.find((i) => i.name.includes(n));
    assert.equal(byName("Rice")?.confidenceScore ?? byName("Rice")?.confidence, 0.98);
    assert.equal(byName("Chicken")?.confidenceScore ?? byName("Chicken")?.confidence, 0.95);
    assert.equal(byName("Onion")?.confidenceScore ?? byName("Onion")?.confidence, 0.94);

    const curd = byName("Curd");
    assert.ok(curd, "expected Curd line item");
    assert.equal(curd.confidenceScore ?? curd.confidence, 0.74);
    assert.equal(curd.confidenceLabel, "low");
  });

  it("R2 vendor hint respected on deterministic fallback", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/receipts/extract",
      payload: { householdId: "hh_demo_001", vendorName: "DailyMart" },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as ExtractBody & { vendorName: string; vendor: string };
    assert.ok(
      (body.vendorName ?? body.vendor ?? "").includes("DailyMart"),
      `expected vendor override, got ${body.vendorName ?? body.vendor}`,
    );
    assert.equal(body.items.length, 4);
  });

  it("R3 extract → confirm commits inventory once (idempotent replay)", async () => {
    const body = await extract({});
    const payload = {
      householdId: "hh_demo_001",
      idempotencyKey: `idem_eval_receipt_${Date.now()}`,
      items: body.items,
    };

    const first = await app.inject({
      method: "POST",
      url: `/api/receipts/${body.receiptId}/confirm`,
      payload,
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().ok, true);
    assert.equal(first.json().added, 4);

    async function chickenOnHand(): Promise<number> {
      const inv = await app.inject({
        method: "GET",
        url: "/api/inventory?householdId=hh_demo_001",
      });
      assert.equal(inv.statusCode, 200);
      const body = inv.json() as {
        items: Array<{ name: string; onHandQuantity: number }>;
      };
      const chicken = body.items.find((r) => r.name === "Chicken");
      assert.ok(chicken, "expected Chicken resource after confirm");
      return chicken.onHandQuantity;
    }

    // Canonical demo receipt replaces seed lots so the demo inventory stays
    // exact (Rice 5kg, Chicken 700g, Onion 2kg, Curd 200ml) — see
    // commitReceiptItems isCanonicalDemoReceipt branch.
    assert.equal(await chickenOnHand(), 700);

    // Same idempotency key → replayed result, no double stock
    const replay = await app.inject({
      method: "POST",
      url: `/api/receipts/${body.receiptId}/confirm`,
      payload,
    });
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().eventId, first.json().eventId);

    assert.equal(await chickenOnHand(), 700);
  });
});
