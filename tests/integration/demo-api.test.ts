import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { executeSnapserveOutboundCall } from "@household/integrations";
import { addDays, todayIso } from "@household/life";
import { buildApiApp } from "../../apps/api/src/app.js";
import type { ClerkAdmin } from "../../apps/api/src/demo-login.js";
import { encryptedFileStore, MemoryBlobStore } from "../../apps/api/src/file-store.js";
import { MemoryStateBackend } from "../../apps/api/src/state-backend.js";

const verifySession = async (token: string) => {
  if (!token.startsWith("user_")) throw new Error("bad token");
  return { userId: token };
};

/** Stands in for Clerk: remembers which calls were made. */
function fakeClerk(over: Partial<ClerkAdmin> = {}) {
  const calls = { find: 0, create: 0, tickets: [] as string[] };
  const admin: ClerkAdmin = {
    async findUserId() {
      calls.find += 1;
      return calls.create > 0 ? "user_demo" : null;
    },
    async createUser() {
      calls.create += 1;
      return "user_demo";
    },
    async createSignInToken(userId) {
      const ticket = `ticket-for-${userId}-${calls.tickets.length}`;
      calls.tickets.push(ticket);
      return ticket;
    },
    ...over,
  };
  return { admin, calls };
}

function make(admin: ClerkAdmin = fakeClerk().admin) {
  const file = path.join(os.tmpdir(), `demo-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  return buildApiApp(new HouseholdStore(file), {
    verifySession,
    stateBackend: new MemoryStateBackend(),
    fileStore: encryptedFileStore(new MemoryBlobStore(), Buffer.alloc(32, 3)),
    demoAdmin: admin,
  });
}
type App = ReturnType<typeof make>;

const as = (token: string) => ({ authorization: `Bearer ${token}` });
const get = async (a: App, token: string, url: string) => (await a.inject({ method: "GET", url, headers: as(token) })).json();
const post = (a: App, token: string, url: string, payload: unknown = {}) => a.inject({ method: "POST", url, headers: as(token), payload: payload as object });
const login = (a: App) => a.inject({ method: "POST", url: "/api/demo/login", payload: {} });

describe("Demo login", () => {
  it("creates the demo account once and hands back a sign-in ticket, without needing a session", async () => {
    const clerk = fakeClerk();
    const a = make(clerk.admin);
    const first = await login(a);
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().ticket, "ticket-for-user_demo-0");
    const second = await login(a);
    assert.equal(second.statusCode, 200);
    assert.equal(clerk.calls.create, 1, "the account is created only once");
    assert.equal(clerk.calls.tickets.length, 2);
    await a.close();
  });

  it("always signs in as the server-chosen account, whatever the caller sends", async () => {
    const clerk = fakeClerk();
    const a = make(clerk.admin);
    const res = await a.inject({ method: "POST", url: "/api/demo/login", payload: { userId: "user_victim", email: "victim@example.com" } });
    assert.equal(res.json().ticket, "ticket-for-user_demo-0");
    await a.close();
  });

  it("gives the demo account a household full of data", async () => {
    const a = make();
    await login(a);
    const p = await get(a, "user_demo", "/api/profile");
    assert.equal(p.isDemo, true);
    assert.equal(p.progress.percent, 100);
    assert.equal(p.family.length, 4);
    assert.ok(p.documents.length >= 10);
    assert.equal(p.vehicles.length, 2);
    assert.equal(p.subscriptions.length, 7);
    assert.equal(p.vendors.length, 6);
    assert.equal(p.bills.length, 3);
    assert.equal(p.uploadsEnabled, false);
    await a.close();
  });

  it("shows every kind of reminder the app can raise", async () => {
    const a = make();
    await login(a);
    const p = await get(a, "user_demo", "/api/profile");
    const kinds = new Set(p.reminders.map((r: { kind: string }) => r.kind));
    for (const kind of ["fuel", "service", "mileage", "document", "bill", "subscription"]) assert.ok(kinds.has(kind), `expected a ${kind} reminder`);
    const city = p.vehicles.find((v: { vehicle: { name: string } }) => v.vehicle.name === "Honda City");
    assert.equal(city.status.fuelLeft.low, true);
    assert.equal(city.status.mileage.state, "dropped");
    assert.equal(city.status.service.state, "due_soon");
    assert.equal(city.status.tyre.state, "check");
    const activa = p.vehicles.find((v: { vehicle: { name: string } }) => v.vehicle.name === "Honda Activa");
    assert.equal(activa.status.service.state, "ok");
    await a.close();
  });

  it("fills the kitchen, cart, notifications and Life Admin like the open demo", async () => {
    const a = make();
    await login(a);
    assert.ok((await get(a, "user_demo", "/api/inventory")).items.length >= 8);
    assert.ok((await get(a, "user_demo", "/api/cart")).items.length > 0);
    assert.ok((await get(a, "user_demo", "/api/meal-plan")).days.length > 0);
    assert.ok((await get(a, "user_demo", "/api/notifications")).groups.length >= 2);
    const titles = (await get(a, "user_demo", "/api/obligations")).obligations.map((o: { title: string }) => o.title);
    for (const expected of ["Netflix", "Amazon Prime", "JioHotstar", "Spotify", "YouTube Premium", "SonyLIV", "ZEE5", "Electricity bill", "Broadband bill (ACT Fibernet)"]) {
      assert.ok(titles.some((t: string) => t.includes(expected)), `Life Admin should list ${expected}`);
    }
    await a.close();
  });

  it("every subscription obligation carries a secure link to pay on the service's own site", async () => {
    const a = make();
    await login(a);
    const subs = (await get(a, "user_demo", "/api/obligations")).obligations.filter((o: { category: string }) => o.category === "subscription");
    assert.equal(subs.length, 7);
    for (const s of subs) assert.match(s.payUrl, /^https:\/\//);
    const netflix = subs.find((s: { title: string }) => s.title === "Netflix");
    assert.equal(netflix.payUrl, "https://www.netflix.com/youraccount");
    assert.equal(subs.find((s: { title: string }) => s.title === "ZEE5").status, "OVERDUE");
    await a.close();
  });

  it("cannot store files, and its vendor calls are always simulated", async () => {
    const a = make();
    await login(a);
    const boundary = "----demo";
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify({ type: "pan" })}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\nX\r\n--${boundary}--\r\n`),
    ]);
    const res = await a.inject({ method: "POST", url: "/api/profile/documents", headers: { ...as("user_demo"), "content-type": `multipart/form-data; boundary=${boundary}` }, payload: body });
    assert.equal(res.statusCode, 403);
    await a.close();

    // Even with live calling configured, a forced-simulated call never touches the network.
    const previousKey = process.env.SNAPSERVE_API_KEY;
    const previousMode = process.env.SNAPSERVE_MODE;
    const realFetch = globalThis.fetch;
    process.env.SNAPSERVE_API_KEY = "sk_live_pretend";
    delete process.env.SNAPSERVE_MODE;
    globalThis.fetch = (() => {
      throw new Error("the demo must never call out");
    }) as typeof fetch;
    try {
      const result = await executeSnapserveOutboundCall({
        actionId: "act1",
        householdId: "hh",
        agentId: 1,
        toNumber: "+916000000103",
        vendorName: "Murugan Chicken Centre",
        orderSummary: "1 kg chicken",
        callScript: "hello",
        forceSimulated: true,
        stepDelayMs: 0,
      });
      assert.equal(result.usedProvider, "deterministic-simulator");
    } finally {
      globalThis.fetch = realFetch;
      if (previousKey === undefined) delete process.env.SNAPSERVE_API_KEY;
      else process.env.SNAPSERVE_API_KEY = previousKey;
      if (previousMode !== undefined) process.env.SNAPSERVE_MODE = previousMode;
    }
  });

  it("starts every visit from the same full household, and reset restores it too", async () => {
    const a = make();
    await login(a);
    await post(a, "user_demo", "/api/profile/vendors", { name: "Extra", kind: "milk", phone: "9840412345" });
    await a.inject({ method: "DELETE", url: "/api/profile/family/mem_arjun", headers: as("user_demo") });
    let p = await get(a, "user_demo", "/api/profile");
    assert.equal(p.vendors.length, 7);
    assert.equal(p.family.length, 3);

    await post(a, "user_demo", "/api/demo/reset");
    p = await get(a, "user_demo", "/api/profile");
    assert.equal(p.vendors.length, 6, "reset restores the demo vendors, not an empty household");
    assert.equal(p.family.length, 4);

    await post(a, "user_demo", "/api/profile/vendors", { name: "Extra", kind: "milk", phone: "9840412345" });
    await login(a);
    assert.equal((await get(a, "user_demo", "/api/profile")).vendors.length, 6);
    await a.close();
  });

  it("does not change what real users see", async () => {
    const a = make();
    await login(a);
    const real = await get(a, "user_real", "/api/profile");
    assert.equal(real.isDemo, false);
    assert.equal(real.progress.percent, 0);
    assert.equal(real.subscriptions.length, 0);
    assert.equal((await get(a, "user_real", "/api/cart")).items.length, 0);
    assert.equal((await get(a, "user_real", "/api/obligations")).obligations.length, 0);
    await a.close();
  });

  it("says so when Clerk is unavailable, without leaking details", async () => {
    const a = make(fakeClerk({ createSignInToken: async () => { throw new Error("Clerk POST /sign_in_tokens failed (500): secret detail"); } }).admin);
    const res = await login(a);
    assert.equal(res.statusCode, 502);
    assert.ok(!res.body.includes("secret detail"));
    assert.match(res.json().error, /demo is unavailable/);
    await a.close();
  });

  it("slows down a script that hammers the open endpoint", async () => {
    const a = make();
    const codes: number[] = [];
    for (let i = 0; i < 10; i += 1) codes.push((await login(a)).statusCode);
    assert.equal(codes.filter((c) => c === 200).length, 8);
    assert.equal(codes.at(-1), 429);
    await a.close();
  });
});

describe("Subscriptions", () => {
  const sub = (over: Record<string, unknown> = {}) => ({ provider: "netflix", amountInr: 649, cycle: "monthly", nextDueOn: addDays(todayIso(), 3), ...over });

  it("uses the service's own payment page unless you give another, and lists it in Life Admin", async () => {
    const a = make();
    assert.equal((await post(a, "user_a", "/api/profile/subscriptions", sub({ plan: "Standard" }))).statusCode, 200);
    const o = (await get(a, "user_a", "/api/obligations")).obligations.find((x: { title: string }) => x.title === "Netflix");
    assert.equal(o.payUrl, "https://www.netflix.com/youraccount");
    assert.equal(o.amountInr, 649);
    assert.equal(o.status, "DUE_SOON");
    const reminders = (await get(a, "user_a", "/api/profile")).reminders;
    assert.ok(reminders.some((r: { kind: string; title: string }) => r.kind === "subscription" && /Netflix renews in 3 days/.test(r.title)));
    await a.close();
  });

  it("accepts a custom service with an https link, and refuses unsafe or missing links", async () => {
    const a = make();
    const ok = await post(a, "user_a", "/api/profile/subscriptions", sub({ provider: "other", name: "Gym", payUrl: "https://gym.example.com/pay" }));
    assert.equal(ok.statusCode, 200);
    assert.equal((await get(a, "user_a", "/api/obligations")).obligations.find((x: { title: string }) => x.title === "Gym").payUrl, "https://gym.example.com/pay");
    for (const payUrl of ["http://gym.example.com/pay", "javascript:alert(1)", "not a link"]) {
      assert.equal((await post(a, "user_a", "/api/profile/subscriptions", sub({ provider: "other", name: "Bad", payUrl }))).statusCode, 400, payUrl);
    }
    assert.equal((await post(a, "user_a", "/api/profile/subscriptions", sub({ provider: "other", name: "NoLink" }))).statusCode, 400);
    assert.equal((await post(a, "user_a", "/api/profile/subscriptions", sub({ provider: "other", payUrl: "https://x.example.com" }))).statusCode, 400);
    await a.close();
  });

  it("marking it paid moves the due date forward one cycle, or to the future if it was late", async () => {
    const a = make();
    const { id } = (await post(a, "user_a", "/api/profile/subscriptions", sub({ nextDueOn: "2026-08-15" }))).json();
    const paid = await post(a, "user_a", `/api/profile/subscriptions/${id}/paid`);
    assert.equal(paid.statusCode, 200);
    const next = paid.json().nextDueOn as string;
    assert.ok(next >= todayIso(), "the next date is never left in the past");
    assert.equal(next.slice(8), "15", "it keeps the same day of the month");
    const view = await get(a, "user_a", "/api/profile");
    assert.equal(view.subscriptions[0].lastPaidOn, todayIso());
    await a.close();
  });

  it("edits and removes a subscription, taking its obligation with it", async () => {
    const a = make();
    const { id } = (await post(a, "user_a", "/api/profile/subscriptions", sub())).json();
    await a.inject({ method: "PUT", url: `/api/profile/subscriptions/${id}`, headers: as("user_a"), payload: sub({ amountInr: 799 }) });
    assert.equal((await get(a, "user_a", "/api/profile")).subscriptions[0].amountInr, 799);
    await a.inject({ method: "DELETE", url: `/api/profile/subscriptions/${id}`, headers: as("user_a") });
    assert.equal((await get(a, "user_a", "/api/obligations")).obligations.some((o: { title: string }) => o.title === "Netflix"), false);
    assert.equal((await a.inject({ method: "DELETE", url: `/api/profile/subscriptions/${id}`, headers: as("user_a") })).statusCode, 404);
    await a.close();
  });
});
