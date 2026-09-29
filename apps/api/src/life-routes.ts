// LIVORA AI routes: life intelligence, notifications, mobility, circular
// living, household sharing scopes, plans and the kitchen sample endpoints.
// Logic lives in @household/life; this file only adapts the canonical store to
// the engine's inputs and validates requests with the shared contracts.
import type { FastifyInstance } from "fastify";
import {
  AssistantAskInputSchema,
  FlagInputSchema,
  ImpactFactorsInputSchema,
  LifeDecisionInputSchema,
  ListingAddInputSchema,
  NotificationsReadInputSchema,
  WardrobeAddInputSchema,
} from "@household/contracts";
import type { HouseholdStore } from "@household/db";
import { listInventory, runForecastEngine } from "@household/domain";
import {
  budgetData,
  daysBetween,
  LifeService,
  smartCart,
  todayIso,
  weeklyMealPlan,
  type LifeForecast,
  type LifeInputs,
  type LifeInventoryItem,
  type LifeObligation,
  type ModuleId,
  type TransportMode,
} from "@household/life";

const DEFAULT_HOUSEHOLD = "hh_demo_001";

const DOMAIN_MAP: Record<string, LifeObligation["domain"]> = {
  vehicle: "vehicle",
  vehicle_service: "vehicle",
  MAINTENANCE: "vehicle",
  utility: "bill",
  BILL: "bill",
  document: "document",
  REMINDER: "document",
  subscription: "subscription",
  APPOINTMENT: "appointment",
};

const STATUS_MAP: Record<string, LifeObligation["status"]> = {
  OVERDUE: "overdue",
  DUE_SOON: "due_soon",
  UPCOMING: "ok",
  COMPLETED: "ok",
};

const MODULES: ModuleId[] = ["kitchen", "admin", "mobility", "circular", "personal"];
const MODES: TransportMode[] = ["metro", "ev", "bus", "cab"];

function qs(request: { query: unknown }): Record<string, string | undefined> {
  return (request.query as Record<string, string | undefined>) ?? {};
}

export function registerLifeRoutes(app: FastifyInstance, store: HouseholdStore) {
  const services = new Map<string, LifeService>();
  const seen = new Map<string, unknown>();

  const buildInputs = (householdId: string): LifeInputs => {
    const { obligations, forecasts } = runForecastEngine(store, householdId);
    const today = todayIso();

    const lifeObligations: LifeObligation[] = obligations.map((o) => {
      const raw = o as unknown as Record<string, unknown>;
      return {
        id: String(raw.id ?? ""),
        domain: DOMAIN_MAP[String(raw.category ?? "document")] ?? "document",
        title: String(raw.title ?? ""),
        provider: String(raw.dependentEntity ?? "Household Ledger"),
        detail: String(raw.conflictDescription ?? raw.subtitle ?? ""),
        dueDate: typeof raw.dueDate === "string" ? raw.dueDate.slice(0, 10) : undefined,
        amount:
          typeof raw.amountInr === "number" ? `₹${raw.amountInr.toLocaleString("en-IN")}` : undefined,
        status: STATUS_MAP[String(raw.status ?? "DUE_SOON")] ?? "due_soon",
      };
    });

    const lifeForecasts: LifeForecast[] = forecasts.map((f) => ({
      id: f.id,
      itemId: f.targetId,
      itemName: f.targetName,
      type: f.riskType as LifeForecast["type"],
      detail: f.explanation,
      horizonDays: f.daysRemaining,
      severity: String(f.severity).toLowerCase() as LifeForecast["severity"],
    }));

    const inventory: LifeInventoryItem[] = listInventory(store, householdId).items.map((r) => {
      const grams = r.displayUnit === "kg" || r.displayUnit === "L";
      const divisor = grams ? 1000 : 1;
      const onHand = r.onHandQuantity + r.incomingQuantity;
      const byBurn = r.avgDailyBurn > 0 ? Math.floor(onHand / r.avgDailyBurn) : null;
      const byExpiry = r.nearestExpiryAt ? daysBetween(today, r.nearestExpiryAt.slice(0, 10)) : null;
      const candidates = [byBurn, byExpiry].filter((n): n is number => n !== null && n >= 0);
      return {
        id: r.id,
        name: r.canonicalName,
        quantity: Math.round((onHand / divisor) * 100) / 100,
        unit: r.displayUnit,
        daysRemaining: candidates.length ? Math.min(...candidates) : null,
      };
    });

    return {
      obligations: lifeObligations,
      forecasts: lifeForecasts,
      inventory,
      cart: smartCart,
      weekly: weeklyMealPlan,
    };
  };

  const svc = (request: { query: unknown }): LifeService => {
    const householdId = qs(request).householdId ?? DEFAULT_HOUSEHOLD;
    let s = services.get(householdId);
    if (!s) {
      s = new LifeService(() => buildInputs(householdId));
      services.set(householdId, s);
    }
    return s;
  };

  /** Call from the demo reset handler so LIVORA state resets with the rest. */
  const reset = () => {
    services.clear();
    seen.clear();
  };

  // ── Kitchen sample endpoints (cart, budget, meal plan) ─────────────────
  app.get("/api/cart", async () => ({ items: smartCart }));
  app.get("/api/budget", async () => ({ budget: budgetData }));
  app.get("/api/meal-plan", async () => ({ days: weeklyMealPlan }));

  // ── Life intelligence ─────────────────────────────────────────────────
  app.get("/api/life/overview", async (request) => svc(request).overview());
  app.get("/api/life/summary", async (request) => svc(request).summary());
  app.get("/api/life/starters", async (request) => ({ questions: svc(request).starters() }));

  app.get("/api/life/search", async (request) => ({
    hits: svc(request).search(qs(request).q ?? ""),
  }));

  app.post("/api/life/decisions", async (request, reply) => {
    const body = LifeDecisionInputSchema.parse(request.body ?? {});
    svc(request).decide(body.suggestionId, body.kind, body.decision);
    return reply.status(201).send({ ok: true });
  });

  app.delete("/api/life/decisions", async (request) => {
    svc(request).resetLearning();
    return { ok: true };
  });

  app.put("/api/life/collisions/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = FlagInputSchema.parse(request.body ?? {});
    svc(request).setCollisionApplied(id, body.enabled);
    return { ok: true };
  });

  app.post("/api/life/assistant", async (request) => {
    const body = AssistantAskInputSchema.parse(request.body ?? {});
    return { answer: svc(request).ask(body.question) };
  });

  // ── Notifications ─────────────────────────────────────────────────────
  app.get("/api/notifications", async (request) => svc(request).notifications());

  app.post("/api/notifications/read", async (request) => {
    const body = NotificationsReadInputSchema.parse(request.body ?? {});
    svc(request).markRead(body.ids);
    return { ok: true };
  });

  // ── Mobility ──────────────────────────────────────────────────────────
  app.get("/api/mobility", async (request) => svc(request).mobility());

  app.get("/api/mobility/leave-by", async (request, reply) => {
    const { arrival, mode } = qs(request);
    if (!arrival || !/^\d{2}:\d{2}$/.test(arrival) || !mode || !MODES.includes(mode as TransportMode)) {
      return reply.status(400).send({ error: "arrival (HH:MM) and mode (metro|ev|bus|cab) are required" });
    }
    return svc(request).leaveBy(arrival, mode as TransportMode);
  });

  app.get("/api/mobility/charge-plan", async (request, reply) => {
    const target = Number(qs(request).target);
    if (!Number.isFinite(target)) return reply.status(400).send({ error: "target (percent) is required" });
    return svc(request).chargePlan(target);
  });

  app.put("/api/mobility/sharing/:contactId", async (request) => {
    const { contactId } = request.params as { contactId: string };
    const body = FlagInputSchema.parse(request.body ?? {});
    svc(request).setTripSharing(contactId, body.enabled);
    return { ok: true };
  });

  app.put("/api/mobility/rides/:poolId", async (request) => {
    const { poolId } = request.params as { poolId: string };
    const body = FlagInputSchema.parse(request.body ?? {});
    svc(request).setRideRequest(poolId, body.enabled);
    return { ok: true };
  });

  // ── Circular living ───────────────────────────────────────────────────
  app.get("/api/circular", async (request) => svc(request).circular());

  app.post("/api/circular/wardrobe", async (request, reply) => {
    const key = String(request.headers["idempotency-key"] ?? "");
    if (key && seen.has(`w:${key}`)) return reply.status(200).send({ item: seen.get(`w:${key}`) });
    const body = WardrobeAddInputSchema.parse(request.body ?? {});
    const item = svc(request).addWardrobe(body);
    if (key) seen.set(`w:${key}`, item);
    return reply.status(201).send({ item });
  });

  app.post("/api/circular/listings", async (request, reply) => {
    const key = String(request.headers["idempotency-key"] ?? "");
    if (key && seen.has(`l:${key}`)) return reply.status(200).send({ item: seen.get(`l:${key}`) });
    const body = ListingAddInputSchema.parse(request.body ?? {});
    const item = svc(request).addListing(body);
    if (key) seen.set(`l:${key}`, item);
    return reply.status(201).send({ item });
  });

  app.get("/api/circular/occasion-plan", async (request) => {
    const { ethnic, accessory } = qs(request);
    return svc(request).occasionPlan({ Ethnic: ethnic || null, Accessory: accessory || null });
  });

  app.put("/api/circular/impact-factors", async (request) => {
    const body = ImpactFactorsInputSchema.parse(request.body ?? {});
    const s = svc(request);
    s.setFactors(body);
    return { factors: s.state.factors, co2Saved: s.circular().co2Saved };
  });

  // ── Household sharing scopes and plans ────────────────────────────────
  app.get("/api/household/scopes", async (request) => ({ scopes: svc(request).scopes() }));

  app.put("/api/household/scopes/:module", async (request, reply) => {
    const { module } = request.params as { module: string };
    if (!MODULES.includes(module as ModuleId)) return reply.status(404).send({ error: "Unknown module" });
    const body = FlagInputSchema.parse(request.body ?? {});
    svc(request).setScope(module as ModuleId, body.enabled);
    return { scopes: svc(request).scopes() };
  });

  app.get("/api/plans", async (request) => svc(request).plans());

  return { reset };
}
