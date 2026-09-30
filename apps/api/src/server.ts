import path from "node:path";
import dotenv from "dotenv";
import { buildApiApp } from "./app.js";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim() || undefined;
  const app = buildApiApp(undefined, { clerkSecretKey });
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
