// Clerk session verification for the API, and the switch from the shared demo
// store to the signed-in user's own store. Enforced only when the server is
// given a verifier (server.ts / vercel-entry.ts do that when CLERK_SECRET_KEY
// is set), so local demos and tests keep working unauthenticated.
import type { FastifyInstance, FastifyRequest } from "fastify";
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

/**
 * Checks a Clerk session token: an RS256 JWT signed by your Clerk instance.
 * The signing keys come from Clerk's JWKS endpoint (authorised with the secret
 * key, so only this instance's keys are trusted). The library loads on the
 * first sign-in check, so a problem with it can never stop the API from booting.
 */
export function clerkVerifier(
  secretKey: string,
  /** Replaces the Clerk key set (tests). */
  keySource?: import("jose").JWTVerifyGetKey,
): SessionVerifier {
  const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((p) => p.trim().replace(/\/$/, ""))
    .filter(Boolean);
  let keys: Promise<import("jose").JWTVerifyGetKey> | undefined = keySource ? Promise.resolve(keySource) : undefined;

  const loadKeys = () =>
    import("jose").then(({ createRemoteJWKSet }) =>
      createRemoteJWKSet(new URL("https://api.clerk.com/v1/jwks"), {
        headers: { Authorization: `Bearer ${secretKey}` },
        cooldownDuration: 30_000,
      }),
    );

  return async (token) => {
    const { jwtVerify } = await import("jose");
    keys ??= loadKeys();
    const { payload } = await jwtVerify(token, await keys, { algorithms: ["RS256"], clockTolerance: 5 });
    // Same rule Clerk applies: when a token names the site that requested it, that site must be allowed.
    const origin = typeof payload.azp === "string" ? payload.azp.replace(/\/$/, "") : undefined;
    if (authorizedParties?.length && origin && !authorizedParties.includes(origin)) {
      throw Object.assign(new Error("origin not allowed"), { reason: "token-invalid-authorized-parties" });
    }
    if (typeof payload.sub !== "string" || !payload.sub) throw new Error("token has no subject");
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
