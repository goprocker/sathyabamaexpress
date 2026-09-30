import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

let appPromise: Promise<FastifyInstance> | null = null;

/** The app is built on the first request so a failure while starting can be reported as JSON instead of a blank platform error page. */
async function boot(): Promise<FastifyInstance> {
  const { buildApiApp } = await import("./app.js");
  const app = buildApiApp(undefined, { clerkSecretKey: process.env.CLERK_SECRET_KEY?.trim() || undefined });
  await app.ready();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    appPromise ??= boot();
    const app = await appPromise;
    app.server.emit("request", req, res);
  } catch (err) {
    appPromise = null; // let the next request try again
    const message = err instanceof Error ? err.message : String(err);
    console.error("[vercel-entry] API failed to start:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `The API failed to start: ${message.slice(0, 300)}`, code: "boot" }));
  }
}
