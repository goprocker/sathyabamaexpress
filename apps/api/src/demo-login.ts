// "Try the demo": signs a visitor into a real Clerk account whose household is
// already full of sample data. The server picks the account (never the caller),
// resets its data, and hands back a short-lived Clerk sign-in ticket. The
// browser exchanges the ticket for a normal session, so the rest of the app
// treats the demo like any other signed-in user.
import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { UserStores } from "./user-stores.js";

export const demoEmail = (): string => (process.env.DEMO_USER_EMAIL?.trim() || "demo@livora.app").toLowerCase();

/** The few Clerk admin calls the demo needs. Split out so tests can stand in for Clerk. */
export interface ClerkAdmin {
  findUserId(email: string): Promise<string | null>;
  createUser(input: { email: string }): Promise<string>;
  createSignInToken(userId: string, ttlSeconds: number): Promise<string>;
}

export function clerkAdmin(secretKey: string, fetchImpl: typeof fetch = fetch): ClerkAdmin {
  const call = async <T>(path: string, init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" }): Promise<T> => {
    const res = await fetchImpl(`https://api.clerk.com/v1${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Clerk ${init.method} ${path} failed (${res.status}): ${text.slice(0, 200)}`);
    return JSON.parse(text) as T;
  };

  return {
    async findUserId(email) {
      const found = await call<Array<{ id: string }> | { data: Array<{ id: string }> }>(`/users?email_address=${encodeURIComponent(email)}&limit=1`);
      const list = Array.isArray(found) ? found : found.data;
      return list[0]?.id ?? null;
    },
    async createUser({ email }) {
      // Nobody ever types a password for this account: the only way in is a server-issued ticket.
      const created = await call<{ id: string }>("/users", {
        method: "POST",
        body: {
          email_address: [email],
          first_name: "Demo",
          last_name: "Household",
          password: `${crypto.randomBytes(24).toString("base64url")}aZ9!`,
          skip_password_checks: true,
        },
      });
      return created.id;
    },
    async createSignInToken(userId, ttlSeconds) {
      const token = await call<{ token: string }>("/sign_in_tokens", { method: "POST", body: { user_id: userId, expires_in_seconds: ttlSeconds } });
      return token.token;
    },
  };
}

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;

export function registerDemoLogin(app: FastifyInstance, deps: { admin: ClerkAdmin; stores: UserStores }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let demoUserId: string | null = null;

  const clientKey = (request: FastifyRequest) => {
    const forwarded = request.headers["x-forwarded-for"];
    return (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) || request.ip;
  };

  // A small brake so a script cannot hammer Clerk through this open endpoint.
  const limited = (key: string): boolean => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    const entry = hits.get(key) ?? { count: 0, resetAt: now + WINDOW_MS };
    entry.count += 1;
    hits.set(key, entry);
    return entry.count > MAX_PER_WINDOW;
  };

  const ensureDemoUser = async (): Promise<string> => {
    if (demoUserId) return demoUserId;
    const email = demoEmail();
    demoUserId = (await deps.admin.findUserId(email)) ?? (await deps.admin.createUser({ email }));
    return demoUserId;
  };

  app.post("/api/demo/login", async (request, reply) => {
    if (limited(clientKey(request))) return reply.code(429).send({ error: "Too many tries. Wait a minute and try again." });
    try {
      const userId = await ensureDemoUser();
      // Every demo visit starts from the same full household.
      await deps.stores.seedDemo(userId);
      return { ticket: await deps.admin.createSignInToken(userId, 300) };
    } catch (err) {
      demoUserId = null;
      console.error("[demo-login] failed:", err instanceof Error ? err.message : err);
      return reply.code(502).send({ error: "The demo is unavailable right now. Please try again in a moment." });
    }
  });
}
