import path from "node:path";
import dotenv from "dotenv";
import { buildApiApp } from "./app.js";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim() || undefined;
  // Restock check timer (minutes); 0 turns it off. Default: every 30 minutes.
  const reorderMinutes = Number(process.env.REORDER_SCAN_INTERVAL_MINUTES ?? 30);
  const reorderScanIntervalMs = Number.isFinite(reorderMinutes) && reorderMinutes > 0 ? reorderMinutes * 60_000 : undefined;
  // Phone ordering: watch the Snapserve ordering agent's calls (scripts/setup-order-agents.ts creates it).
  const orderAgentId = Number(process.env.SNAPSERVE_ORDER_AGENT_ID);
  // Exactly one process may watch the line, or two servers sharing the database
  // would both call the store: production by default, dev only with PHONE_ORDER_WATCHER=on.
  const watcherSetting = process.env.PHONE_ORDER_WATCHER?.trim().toLowerCase();
  const watchLine = watcherSetting ? watcherSetting === "on" : process.env.NODE_ENV === "production";
  const phoneOrders =
    watchLine && Number.isInteger(orderAgentId) && orderAgentId > 0 && process.env.SNAPSERVE_API_KEY?.trim()
      ? { agentId: orderAgentId, pollMs: Math.max(5_000, Number(process.env.SNAPSERVE_ORDER_POLL_MS) || 15_000) }
      : undefined;
  const app = buildApiApp(undefined, { clerkSecretKey, reorderScanIntervalMs, phoneOrders });
  if (phoneOrders) console.log(`[Household Intelligence API] Watching Snapserve agent ${phoneOrders.agentId} for phone orders`);
  console.log(
    clerkSecretKey
      ? "[Household Intelligence API] Clerk auth enforced"
      : "[Household Intelligence API] CLERK_SECRET_KEY not set: API is open (local demo mode)",
  );

  const shutdown = async (signal: string) => {
    console.log(`[Household Intelligence API] Received ${signal}, shutting down gracefully...`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      console.error("[Household Intelligence API] Error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    console.log(
      `[Household Intelligence API] Listening on ${address} (Default household: hh_demo_001)`
    );
  } catch (err) {
    console.error("Failed to start API server:", err);
    process.exit(1);
  }
}

void start();
