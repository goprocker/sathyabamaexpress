// Clerk session verification for the API. Enforced only when the server is
// started with requireAuth (server.ts / vercel-entry.ts turn it on when
// CLERK_SECRET_KEY is set), so local demos and tests keep working unauthenticated.
import type { FastifyInstance } from "fastify";
import { verifyToken } from "@clerk/backend";

/** Routes that must stay reachable without a user session. */
const PUBLIC_ROUTES = new Set(["/api/health", "/api/ready"]);
const PUBLIC_PREFIXES = [
  // Signed with its own HMAC secret by Snapserve, not by a signed-in user.
  "/api/webhooks/",
  // EventSource cannot send an Authorization header; the stream carries event ids only.
  "/api/events/stream",
];

export function registerClerkAuth(app: FastifyInstance, secretKey: string) {
  const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // preParsing: after CORS headers are set, before any request body (uploads) is read.
  app.addHook("preParsing", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    const path = request.url.split("?")[0] ?? "";
    if (PUBLIC_ROUTES.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return;

    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return reply.code(401).send({ error: "Sign in required." });

    try {
      await verifyToken(token, {
        secretKey,
        ...(authorizedParties?.length ? { authorizedParties } : {}),
      });
    } catch {
      return reply.code(401).send({ error: "Session expired. Sign in again." });
    }
  });
}
