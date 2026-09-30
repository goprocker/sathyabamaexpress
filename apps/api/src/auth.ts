// Clerk session verification for the API, and the switch from the shared demo
// store to the signed-in user's own store. Enforced only when the server is
// given a verifier (server.ts / vercel-entry.ts do that when CLERK_SECRET_KEY
// is set), so local demos and tests keep working unauthenticated.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifyToken } from "@clerk/backend";
import { runWithUser } from "./request-context.js";
import type { UserStores } from "./user-stores.js";

export type SessionVerifier = (token: string) => Promise<{ userId: string }>;

/** Routes that must stay reachable without a user session. */
const PUBLIC_ROUTES = new Set(["/api/health", "/api/ready"]);
const PUBLIC_PREFIXES = [
  // Signed with its own HMAC secret by Snapserve, not by a signed-in user.
  "/api/webhooks/",
  // EventSource cannot send an Authorization header, so the stream takes ?token= and checks it itself.
  "/api/events/stream",
];

export function clerkVerifier(secretKey: string): SessionVerifier {
  const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return async (token) => {
    const payload = await verifyToken(token, {
      secretKey,
      ...(authorizedParties?.length ? { authorizedParties } : {}),
    });
    if (!payload.sub) throw new Error("Token has no subject.");
    return { userId: payload.sub };
  };
}

const bearer = (request: FastifyRequest): string => {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
};

const userOf = new WeakMap<FastifyRequest, string>();

export function registerAuth(app: FastifyInstance, verify: SessionVerifier, stores: UserStores) {
  // preParsing: after CORS headers are set, before any request body (uploads) is read.
  // Callback style so the rest of the request runs inside the user's context.
  app.addHook("preParsing", (request, reply, payload, done) => {
    if (request.method === "OPTIONS") return done(null, payload);
    const path = request.url.split("?")[0] ?? "";
    if (PUBLIC_ROUTES.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return done(null, payload);

    const token = bearer(request);
    if (!token) {
      void reply.code(401).send({ error: "Sign in required." });
      return;
    }
    void (async () => {
      let userId: string;
      try {
        userId = (await verify(token)).userId;
      } catch (err) {
        // The reason (wrong key pair, unauthorised origin, expired token) is what you need in the logs; never the token.
        const reason = (err as { reason?: string }).reason ?? (err instanceof Error ? err.message : "unknown");
        console.warn(`[auth] session token rejected: ${reason}`);
        void reply.code(401).send({ error: "Session expired. Sign in again.", code: "session" });
        return;
      }
      let store;
      try {
        store = await stores.get(userId);
      } catch (err) {
        console.error("[auth] could not open the household store:", err);
        void reply.code(503).send({ error: "Couldn't open your household right now. Try again in a moment.", code: "storage" });
        return;
      }
      userOf.set(request, userId);
      runWithUser({ userId, store }, () => done(null, payload));
    })();
  });

  // Serverless functions freeze once the response is out, so make sure the user's
  // changes are stored before it leaves.
  app.addHook("onSend", async (request, _reply, payload) => {
    const userId = userOf.get(request);
    if (userId) await stores.flush(userId);
    return payload;
  });
}

/** For routes that authenticate themselves (the event stream): returns the user id or null. */
export async function verifyRequestToken(verify: SessionVerifier, token: string): Promise<string | null> {
  try {
    return (await verify(token)).userId;
  } catch {
    return null;
  }
}
