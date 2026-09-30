import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { VoiceStreamServerMessageSchema, type VoiceStreamServerMessage } from "@household/contracts";
import { buildApiApp } from "../../apps/api/src/app.js";
import { MemoryStateBackend } from "../../apps/api/src/state-backend.js";

// Hermetic: no Sarvam or OpenAI calls leave the process.
process.env.SARVAM_API_KEY = "";
process.env.OPENAI_API_KEY = "";

function app(options: Parameters<typeof buildApiApp>[1] = {}) {
  const file = path.join(os.tmpdir(), `voice-stream-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  return buildApiApp(new HouseholdStore(file), options);
}

describe("live voice transcription route", () => {
  it("reports an error and ends cleanly when Sarvam is not configured", async () => {
    const a = app();
    await a.ready();
    const messages: VoiceStreamServerMessage[] = [];
    let ended: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      ended = resolve;
    });
    // Listen from onInit: the server may speak before injectWS resolves.
    const ws = await a.injectWS("/api/voice/stream?language=ta-IN", {}, {
      onInit: (socket) => {
        socket.on("message", (data) => {
          const msg = VoiceStreamServerMessageSchema.parse(JSON.parse(data.toString()));
          messages.push(msg);
          if (msg.type === "end") ended();
        });
        socket.on("close", () => ended());
      },
    });
    await done;
    assert.deepEqual(
      messages.map((m) => m.type),
      ["error", "end"],
    );
    ws.terminate();
    await a.close();
  });

  it("refuses the upgrade without a session token when auth is on", async () => {
    const a = app({
      verifySession: async (token) => {
        if (token !== "good") throw new Error("bad token");
        return { userId: "user_1" };
      },
      stateBackend: new MemoryStateBackend(),
    });
    await a.ready();
    await assert.rejects(a.injectWS("/api/voice/stream"));
    await assert.rejects(a.injectWS("/api/voice/stream?token=nope"));
    await a.close();
  });
});

describe("receipt upload size", () => {
  it("accepts a receipt image larger than Fastify's 1 MiB default", async () => {
    const a = app();
    const res = await a.inject({
      method: "POST",
      url: "/api/receipts/extract",
      payload: { householdId: "hh_demo_001", imageBase64: `data:image/jpeg;base64,${"A".repeat(1_500_000)}` },
    });
    assert.notEqual(res.statusCode, 413);
    await a.close();
  });
});
