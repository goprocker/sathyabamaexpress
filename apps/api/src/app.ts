import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";
import dotenv from "dotenv";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import {
  ConfirmReceiptInputSchema,
  CounterfactualSimulationInputSchema,
  MealCommitInputSchema,
  MealSimulationInputSchema,
  ObligationIngestInputSchema,
  OrderRequestSchema,
  VerifyDeliveryInputSchema,
  type DashboardAttentionItem,
  type DashboardResponse,
  type Resource,
  type RippleGraph,
} from "@household/contracts";
import { db, type HouseholdStore } from "@household/db";
import {
  commitReceiptItems,
  consumeMealIngredients,
  getInventoryItemDetail,
  getRippleGraphByEventId,
  listInventory,
  runForecastEngine,
  simulateCounterfactualRipple,
  simulateMeal,
  verifyPhysicalDelivery,
} from "@household/domain";
import {
  runActionApprovalAndExecutionWorkflow,
  runInventoryReorderWorkflow,
  runVoiceOrderWorkflow,
  runMealPlanningWorkflow,
  runObligationIngestWorkflow,
  runReceiptExtractionWorkflow,
  runVoiceIntakeWorkflow,
} from "@household/agents";
import { clerkVerifier, registerAuth, verifyRequestToken, type SessionVerifier } from "./auth.js";
import { clerkAdmin, registerDemoLogin, type ClerkAdmin } from "./demo-login.js";
import { defaultFileStore, type FileStore } from "./file-store.js";
import { registerProfileRoutes } from "./profile-routes.js";
import { currentUser, ownsHousehold, runWithUser, scopedStore } from "./request-context.js";
import { defaultStateBackend, type StateBackend } from "./state-backend.js";
import { UserStores } from "./user-stores.js";
import { registerLifeRoutes } from "./life-routes.js";
import { registerVoiceStream } from "./voice-stream.js";
import { startReorderScheduler } from "./reorder-scheduler.js";
import { registerStoreRoutes } from "./store-routes.js";
import { startPhoneOrderWatcher } from "./phone-orders.js";
import { createNotificationService, registerPushRoutes, type NotificationService } from "./notifications.js";
import {
  isSnapserveLive,
  listSnapserveCalls,
  resolveSnapserveAgent,
  resolveSnapserveAgentNumber,
  verifySnapserveWebhookSignature,
} from "@household/integrations";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function mapResourceIdAlias(id: string): string {
  if (id.startsWith("ing_")) {
    return id.replace(/^ing_/, "res_");
  }
  return id;
}

function mapRecipeIdAlias(id?: string): string | undefined {
  if (!id) return undefined;
  if (id === "rcp_biryani") return "rcp_chicken_biryani";
  if (id === "rcp_curry") return "rcp_chicken_curry";
  if (id === "rcp_dosa") return "rcp_sambar_rice";
  return id;
}

function enrichResourceWithFrontendShape(res: Resource) {
  const effectiveQty = res.onHandQuantity + res.incomingQuantity;
  const displayQty =
    res.displayUnit === "kg" || res.displayUnit === "L"
      ? Math.round((effectiveQty / 1000) * 100) / 100
      : effectiveQty;
  const onHandDisplayQty =
    res.displayUnit === "kg" || res.displayUnit === "L"
      ? Math.round((res.onHandQuantity / 1000) * 100) / 100
      : res.onHandQuantity;
  const incomingDisplayQty =
    res.displayUnit === "kg" || res.displayUnit === "L"
      ? Math.round((res.incomingQuantity / 1000) * 100) / 100
      : res.incomingQuantity;
  const lowThresh =
    res.displayUnit === "kg" || res.displayUnit === "L"
      ? Math.round((res.safetyThreshold / 1000) * 100) / 100
      : res.safetyThreshold;
  const dailyCons =
    res.displayUnit === "kg" || res.displayUnit === "L"
      ? Math.round((res.avgDailyBurn / 1000) * 100) / 100
      : res.avgDailyBurn;

  return {
    ...res,
    // Frontend view-model compatibility properties (apps/web/src/mocks/types.ts)
    name: res.canonicalName,
    quantity: displayQty,
    unit: res.displayUnit,
    lowThreshold: lowThresh,
    expiry: res.nearestExpiryAt ? res.nearestExpiryAt.slice(0, 10) : undefined,
    dailyConsumption: dailyCons,
    history: [
      ...(res.incomingQuantity > 0
        ? [
            {
              date: res.updatedAt.slice(0, 10),
              delta: incomingDisplayQty,
              label: "Purchase confirmed · Kaveri Fresh Mart",
            },
          ]
        : []),
      {
        date: res.updatedAt.slice(0, 10),
        delta: onHandDisplayQty,
        label: "Receipt · Kaveri Fresh Mart",
      },
    ],
  };
}

function enrichRippleGraphWithFrontendShape(graph: RippleGraph) {
  const stateMap: Record<string, string> = {
    MEAL: "planned",
    EVENT: "planned",
    RESOURCE: "available",
    SHORTAGE: "short",
    COMPETING_MEAL: "warning",
    OBLIGATION: "warning",
    FORECAST: "warning",
    ACTION: "proposed",
  };

  return {
    ...graph,
    nodes: graph.nodes.map((n) => ({
      ...n,
      state:
        n.status === "CRITICAL"
          ? "short"
          : n.status === "ACTION_REQUIRED"
            ? "proposed"
            : n.status === "WARNING"
              ? "warning"
              : stateMap[n.type] || "available",
      detail: n.sublabel,
    })),
    edges: graph.edges.map((e) => ({
      ...e,
      from: e.source,
      to: e.target,
      label: e.label || e.relation,
    })),
  };
}

export interface ApiAppOptions {
  /** Clerk secret key. When set, every route except the public ones needs a valid session token. */
  clerkSecretKey?: string | undefined;
  /** Replaces Clerk's token check (tests). Also turns enforcement on. */
  verifySession?: SessionVerifier | undefined;
  /** Where signed-in users' households are stored. Defaults to Postgres (DATABASE_URL) or local files. */
  stateBackend?: StateBackend | undefined;
  /** Where uploaded documents are kept (encrypted). Defaults to Postgres or local files, and is off without an encryption key. */
  fileStore?: FileStore | null | undefined;
  /** Replaces Clerk's admin API for the demo login (tests). */
  demoAdmin?: ClerkAdmin | undefined;
  /** Re-check every household for restock needs on this interval. Off when unset (tests, serverless). */
  reorderScanIntervalMs?: number | undefined;
  /** Snapserve ordering agent to watch for phone orders (with its poll interval). Off when unset. */
  phoneOrders?: { agentId: number; pollMs: number } | undefined;
}

export function buildApiApp(customStore?: HouseholdStore, options: ApiAppOptions = {}): FastifyInstance {
  // Signed-in users each get their own store; `store` resolves to it per request.
  // Without a signed-in user (auth off) it is the shared demo store.
  const store = scopedStore(customStore || db);
  const app = Fastify({
    logger: false,
  });

  const verifySession =
    options.verifySession ?? (options.clerkSecretKey ? clerkVerifier(options.clerkSecretKey) : undefined);
  const userStores = verifySession ? new UserStores(options.stateBackend ?? defaultStateBackend()) : null;
  if (verifySession && userStores) registerAuth(app, verifySession, userStores);
  const demoAdmin = options.demoAdmin ?? (options.clerkSecretKey ? clerkAdmin(options.clerkSecretKey) : undefined);
  if (userStores && demoAdmin) registerDemoLogin(app, { admin: demoAdmin, stores: userStores });

  // Active SSE clients for live UI updates (Snapserve call progression, inventory changes, etc.).
  // Each is tagged with its owner so one user never receives another's events (null = shared demo).
  const sseClients = new Map<ServerResponse, string | null>();

  // Set below; events that change stock or orders refresh the household's notifications.
  let notifications: NotificationService | null = null;
  const NOTIFY_ON = new Set([
    "ACTION_APPROVED",
    "ACTION_REJECTED",
    "ACTION_RECONCILED",
    "SNAPSERVE_CALL_PROGRESS",
    "DELIVERY_RECONCILED",
    "RECEIPT_CONFIRMED",
    "MEAL_COMMITTED",
    "MEAL_CONSUMED",
    "REORDER_PROPOSED",
  ]);

  const broadcastRealtime = (
    eventType: string,
    payload: Record<string, unknown>
  ) => {
    if (NOTIFY_ON.has(eventType) && notifications) void notifications.refresh();
    const message = `event: ${eventType}\ndata: ${JSON.stringify({
      type: eventType,
      timestamp: new Date().toISOString(),
      ...payload,
    })}\n\n`;
    const owner = currentUser()?.userId ?? null;
    for (const [client, clientOwner] of sseClients) {
      if (clientOwner !== owner) continue;
      try {
        client.write(message);
      } catch {
        sseClients.delete(client);
      }
    }
  };

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  app.register(multipart, {
    limits: {
      fileSize: 15 * 1024 * 1024, // 15 MB max receipt/audio upload
    },
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    return payload;
  });

  // Request validation failures (Zod) are client errors, not server faults.
  app.setErrorHandler((error, _request, reply) => {
    const issues = (error as { issues?: Array<{ path: unknown[]; message: string }> }).issues;
    if (Array.isArray(issues)) {
      return reply.status(400).send({
        error: "Invalid request",
        issues: issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ error: status >= 500 ? "Internal Server Error" : (error as Error).message });
  });

  notifications = createNotificationService(store, {
    broadcast: broadcastRealtime,
    log: (msg, detail) => app.log.warn({ detail }, msg),
  });
  registerPushRoutes(app, store);

  // Inventory restock: keep one approval-ready vendor call per vendor in step with
  // stock that is out, low or expiring. Approving it places the Snapserve call.
  const checkReorders = async (trigger: string) => {
    try {
      const result = await runInventoryReorderWorkflow(store, { trigger });
      if (result.created.length || result.withdrawnIds.length) {
        broadcastRealtime("REORDER_PROPOSED", {
          created: result.created.map((a) => a.id),
          withdrawn: result.withdrawnIds,
          pending: result.pending.map((a) => a.id),
        });
      }
      // Stock just changed or was re-checked: raise low / out / expiring alerts.
      await notifications?.refresh();
      return result;
    } catch (err) {
      app.log.warn({ err }, "reorder check failed");
      return null;
    }
  };
  /** Wraps a handler that changes stock so the restock check runs before the response (and the user's state) is saved. */
  const afterInventoryChange =
    (trigger: string, handler: (request: any, reply: any) => Promise<unknown>) =>
    async (request: any, reply: any) => {
      const out = await handler(request, reply);
      if (!reply.sent && reply.statusCode < 400) await checkReorders(trigger);
      return out;
    };

  if (options.reorderScanIntervalMs && options.reorderScanIntervalMs > 0) {
    const stop = startReorderScheduler({
      intervalMs: options.reorderScanIntervalMs,
      userStores,
      check: checkReorders,
      onError: (err) => app.log.warn({ err }, "scheduled reorder check failed"),
    });
    app.addHook("onClose", async () => stop());
  }

  // Stores and phone ordering.
  registerStoreRoutes(app, store);

  if (options.phoneOrders) {
    const stop = startPhoneOrderWatcher({
      agentId: options.phoneOrders.agentId,
      intervalMs: options.phoneOrders.pollMs,
      listCalls: (agentId) => listSnapserveCalls({ agentId, limit: 20 }),
      demoStore: customStore || db,
      userStores,
      placeOrder: async (householdStore, approverUserId, call, order) => {
        await runVoiceOrderWorkflow(householdStore, {
          callId: call.id,
          callerPhone: call.fromNumber ?? "",
          orderText: order.orderText,
          preferredStore: order.preferredStore,
          deliveryNote: order.deliveryNote,
          approverUserId,
          stepDelayMs: 0,
          onBroadcast: broadcastRealtime,
        });
      },
      onLog: (message, detail) => app.log.warn(detail ?? {}, message),
    });
    app.addHook("onClose", async () => stop());
  }

  // LIVORA AI modules: life intelligence, mobility, circular, notifications.
  const life = registerLifeRoutes(app, store, {
    afterInventoryChange: (trigger) => checkReorders(trigger),
    // Opening the notification centre re-checks stock (expiry is time-based), which also refreshes notifications.
    householdNotifications: notifications && {
      refresh: () => checkReorders("Notifications opened"),
      feed: notifications.feed,
      markRead: notifications.markRead,
    },
  });
  registerVoiceStream(app, verifySession);

  // Setup: family, documents, vehicles, bills and vendors. Uploaded files only exist for signed-in users.
  const fileStore = options.fileStore !== undefined ? options.fileStore : verifySession ? defaultFileStore() : null;
  registerProfileRoutes(app, store, fileStore);

  // ==========================================================================
  // 1. Health, Readiness, State Diff & Realtime SSE Stream
  // ==========================================================================

  app.get("/api/health", async () => {
    const state = store.getState();
    return {
      status: "ok",
      service: "household-intelligence-api",
      stateVersion: state.stateVersion || 1,
      householdId: state.households[0]?.id || "hh_demo_001",
      resourcesTracked: state.resources.length,
      expectationsPending: (state.expectations || []).filter(
        (e) => e.status === "AWAITING_DELIVERY"
      ).length,
      uptimeSeconds: Math.round(process.uptime()),
      // How this server is set up, for diagnosing a deployment. Names and yes/no only, never values.
      config: {
        auth: verifySession ? "enforced" : "open (no CLERK_SECRET_KEY)",
        storage: verifySession ? (process.env.DATABASE_URL?.trim() ? "postgres" : "files (not durable on serverless)") : "shared demo",
        authorizedParties: Boolean(process.env.CLERK_AUTHORIZED_PARTIES?.trim()),
      },
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/api/ready", async () => {
    const state = store.getState();
    return {
      ready: state.resources.length > 0,
      stateVersion: state.stateVersion || 1,
      providers: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        sarvam: Boolean(process.env.SARVAM_API_KEY),
        snapserve: Boolean(process.env.SNAPSERVE_API_KEY),
      },
      timestamp: new Date().toISOString(),
    };
  });

  app.get("/api/state/diff", async () => {
    const state = store.getState();
    const recentEvents = state.events.slice(0, 10);
    const eventTransitions = recentEvents.flatMap((e) => e.transitions || []);
    const auditTransitions = state.auditLogs
      .slice(0, 10)
      .flatMap((a) => a.transitions || []);
    const combined =
      eventTransitions.length > 0 ? eventTransitions : auditTransitions;

    const seedFallbackTransitions = [
      {
        entityType: "meal_plan" as const,
        entityId: "mp_biryani_001",
        entityLabel: "Chicken Biryani (6 guests)",
        field: "status",
        before: "NONE",
        after: "PLANNED_SHORTAGE",
        deltaDisplay: "NONE → PLANNED_SHORTAGE",
      },
      {
        entityType: "resource" as const,
        entityId: "res_chicken",
        entityLabel: "Chicken",
        field: "reservedQuantity",
        before: "0 g",
        after: "1.5 kg",
        deltaDisplay: "+1.5 kg reserved (800 g deficit)",
      },
      {
        entityType: "resource" as const,
        entityId: "res_curd",
        entityLabel: "Curd",
        field: "reservedQuantity",
        before: "0 ml",
        after: "300 ml",
        deltaDisplay: "+300 ml reserved (100 ml deficit)",
      },
      {
        entityType: "action" as const,
        entityId: "act_order_chicken_001",
        entityLabel: "Order 800 g Chicken + 100 ml Curd",
        field: "status",
        before: "NONE",
        after: "PENDING_APPROVAL",
        deltaDisplay: "NONE → PENDING_APPROVAL",
      },
    ];

    // The illustrative transitions are demo-only; a signed-in household with no history has none.
    const noHistory = ownsHousehold() ? ([] as typeof seedFallbackTransitions) : seedFallbackTransitions;

    const latestTransitions =
      recentEvents.find((e) => e.transitions && e.transitions.length > 0)
        ?.transitions ??
      state.auditLogs[0]?.transitions ??
      noHistory;

    return {
      stateVersion: state.stateVersion || 1,
      latestEvent: recentEvents[0] || null,
      latestTransitions,
      recentTransitions:
        combined.length > 0 ? combined : noHistory,
      recentAudits: state.auditLogs.slice(0, 8),
      expectations: state.expectations || [],
    };
  });

  app.get("/api/events/stream", async (request, reply) => {
    // EventSource cannot send headers, so signed-in mode takes the session token in the query.
    let owner: string | null = null;
    if (verifySession) {
      const token = String((request.query as { token?: string }).token ?? "");
      owner = token ? await verifyRequestToken(verifySession, token) : null;
      if (!owner) return reply.code(401).send({ error: "Sign in required." });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    reply.raw.write(
      `event: CONNECTED\ndata: ${JSON.stringify({
        status: "connected",
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
    sseClients.set(reply.raw, owner);

    request.raw.on("close", () => {
      sseClients.delete(reply.raw);
    });
  });

  // ==========================================================================
  // 2. Dashboard Aggregate Endpoint
  // ==========================================================================

  app.get("/api/dashboard", async (request) => {
    const query = (request.query as { householdId?: string }) || {};
    const householdId = query.householdId || "hh_demo_001";
    await checkReorders("Dashboard opened");

    const inv = listInventory(store, householdId);
    const { forecasts, obligations } = runForecastEngine(store, householdId);
    const state = store.getState();

    const household =
      state.households.find((h) => h.id === householdId) || state.households[0]!;
    const pendingActions = state.actions.filter(
      (a) => a.householdId === householdId && a.status === "PENDING_APPROVAL"
    );

    const attentionItems: Array<
      DashboardAttentionItem & { description: string; href: string }
    > = [];

    // 1) Shortages from resources
    for (const res of inv.items.filter((i) => i.deficitQuantity > 0)) {
      const linkedAction = pendingActions[0];
      const latestRipple = state.rippleGraphs["latest"];
      const whyEv =
        latestRipple?.explanations.find((e) => e.resourceId === res.id) ||
        forecasts.find((f) => f.targetId === res.id)?.whyEvidence;

      const subtitle = linkedAction
        ? `Purchase proposed · ${
            linkedAction.targetVendor?.name || "Kaveri Fresh"
          }`
        : `Required for planned meal (${res.formattedOnHand} on hand)`;

      attentionItems.push({
        id: `att_short_${res.id}`,
        type: "MEAL_SHORTAGE",
        title: `${res.canonicalName} · ${res.formattedDeficit} short`,
        subtitle,
        description: subtitle,
        href: "/actions",
        badgeText: `Short ${res.formattedDeficit}`,
        severity: "HIGH",
        actionId: linkedAction?.id,
        eventId: latestRipple?.eventId,
        resourceId: res.id,
        whyEvidence: whyEv,
      });
    }

    // 2) Expiring items
    for (const res of inv.items.filter((i) => i.status === "EXPIRING")) {
      const frc = forecasts.find(
        (f) => f.targetId === res.id && f.riskType === "EXPIRY_RISK"
      );
      const subtitle = `${res.formattedOnHand} unused · Use before tomorrow`;
      attentionItems.push({
        id: `att_exp_${res.id}`,
        type: "EXPIRING_LOT",
        title: `${res.canonicalName} · ${res.formattedOnHand} expiring tomorrow`,
        subtitle,
        description: subtitle,
        href: `/inventory/${res.id}`,
        badgeText: "Expiring 1d",
        severity: "MEDIUM",
        resourceId: res.id,
        whyEvidence: frc?.whyEvidence,
      });
    }

    // 3) Due-soon obligations
    for (const obl of obligations.filter((o) => o.status === "DUE_SOON")) {
      const subtitle = obl.conflictDescription || obl.subtitle;
      attentionItems.push({
        id: `att_obl_${obl.id}`,
        type: "OBLIGATION_DUE",
        title: obl.title,
        subtitle,
        description: subtitle,
        href: "/obligations",
        badgeText: `Due in ${obl.daysUntilDue}d`,
        severity: "HIGH",
        eventId: obl.sourceEventId || "evt_seed_obligation_001",
      });
    }

    const todayMeals = state.mealPlans.filter(
      (m) => m.householdId === householdId
    );
    // Demo mode keeps its illustrative dinner; a signed-in household with no plan has none.
    const activeMeal =
      todayMeals[0] ||
      (ownsHousehold()
        ? null
        : { recipeName: "Chicken Biryani", dishName: "Chicken Biryani", servings: 6, shortageCount: 2 });

    const recentActivity = state.timeline
      .filter((t) => t.householdId === householdId)
      .slice(0, 10)
      .map((t) => ({
        ...t,
        time: t.timeFormatted,
        kind:
          t.category === "shortage"
            ? "alert"
            : t.category === "reconciliation"
              ? "agent"
              : t.category,
      }));

    const response: DashboardResponse & Record<string, unknown> = {
      household,
      greeting: "Good morning",
      todayMeals,
      // Frontend view-model compatibility property
      todayMeal: activeMeal
        ? {
            recipeName: activeMeal.dishName,
            servings: activeMeal.servings,
            shortCount: activeMeal.shortageCount,
          }
        : null,
      inventorySummary: {
        ...inv.summary,
        total: inv.summary.totalItems,
        low: inv.summary.lowCount + inv.summary.shortCount,
        expiring: inv.summary.expiringSoonCount,
      },
      attentionItems,
      pendingActions,
      recentActivity,
    };

    return response;
  });

  // ==========================================================================
  // 3. Demo Reset Endpoint (<1s Canonical Seed Restore)
  // ==========================================================================

  const handleDemoReset = async (request: { body?: unknown }) => {
    const body = (request.body as { householdId?: string; mode?: string }) || {};
    const householdId = body.householdId || "hh_demo_001";
    const mode = body.mode === "post-receipt" ? "post-receipt" : "pre-receipt";
    store.resetToCanonicalSeed(mode);
    life.reset();
    const resetTimestamp = new Date().toISOString();
    broadcastRealtime("DEMO_RESET", { householdId, resetTimestamp });
    return {
      ok: true,
      householdId,
      resetTimestamp,
      message: "Household state restored to canonical judge demo baseline.",
    };
  };

  app.post("/api/demo/reset", handleDemoReset);
  app.post("/api/reset", handleDemoReset);

  // ==========================================================================
  // 4. Kitchen Inventory & Receipt Endpoints
  // ==========================================================================

  app.get("/api/inventory", async (request) => {
    const query =
      (request.query as {
        householdId?: string;
        search?: string;
        filter?: "all" | "low" | "expiring" | "reserved" | "attention";
      }) || {};
    const res = listInventory(store, query.householdId || "hh_demo_001", {
      search: query.search,
      filter: query.filter,
    });
    const state = store.getState();
    return {
      ...res,
      items: res.items.map((item) => ({
        ...enrichResourceWithFrontendShape(item),
        lots: state.lots
          .filter((l) => l.resourceId === item.id)
          .map((l) => ({
            ...l,
            itemId: item.id,
            quantity: l.quantityRemaining,
            unit: item.baseUnit,
            source: l.sourceEventId || "receipt",
          })),
      })),
    };
  });

  app.get("/api/inventory/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const canonicalId = mapResourceIdAlias(id);
    const detail = getInventoryItemDetail(store, canonicalId);
    if (!detail) {
      return reply.status(404).send({ error: `Resource not found: ${id}` });
    }
    const forecasts = store
      .getState()
      .forecasts.filter((f) => f.targetId === canonicalId);
    return {
      ...enrichResourceWithFrontendShape(detail.resource),
      ...detail,
      forecasts,
    };
  });

  const handleReceiptExtract = async (request: any, reply: any) => {
    let imageBase64: string | undefined;
    let rawText: string | undefined;
    let vendorHint: string | undefined;
    let householdId = "hh_demo_001";

    if (request.isMultipart && request.isMultipart()) {
      const file = await request.file();
      if (file) {
        const buffer = await file.toBuffer();
        imageBase64 = buffer.toString("base64");
      }
    } else if (request.body && typeof request.body === "object") {
      const b = request.body as Record<string, unknown>;
      imageBase64 = typeof b.imageBase64 === "string" ? b.imageBase64 : undefined;
      rawText = typeof b.rawText === "string" ? b.rawText : undefined;
      vendorHint = typeof b.vendorName === "string" ? b.vendorName : undefined;
      if (typeof b.householdId === "string") householdId = b.householdId;
    }

    let extraction: Awaited<ReturnType<typeof runReceiptExtractionWorkflow>>;
    try {
      extraction = await runReceiptExtractionWorkflow(store, {
        householdId,
        imageBase64,
        rawText,
        vendorHint,
        // Signed-in households never get invented sample lines.
        demoFallback: !ownsHousehold(),
      });
    } catch (err) {
      return reply.code(422).send({ error: err instanceof Error ? err.message : "Couldn't read that receipt." });
    }
    const { receipt, agentRun } = extraction;

    return {
      id: receipt.id,
      receiptId: receipt.id,
      receipt,
      vendor: receipt.vendorName,
      vendorName: receipt.vendorName,
      items: receipt.items.map((i) => ({
        ...i,
        name: i.canonicalName,
        confidenceScore: i.confidence,
        confidenceLabel: i.needsReview ? ("low" as const) : ("high" as const),
      })),
      needsReviewCount: receipt.items.filter((i) => i.needsReview).length,
      agentRunId: agentRun.id,
    };
  };

  // Receipts arrive as base64 JSON (a PDF cannot be downscaled in the browser), so allow more than the 1 MiB default.
  app.post("/api/receipts/extract", { bodyLimit: 15 * 1024 * 1024 }, handleReceiptExtract);
  app.post("/api/receipts/upload", handleReceiptExtract);

  const handleReceiptConfirm = async (request: any) => {
    const params = (request.params as { id?: string }) || {};
    const body = request.body || {};
    const receiptId =
      params.id || body.receiptId || `rcpt_manual_${Date.now()}`;

    const rawItems = Array.isArray(body)
      ? body
      : body.items ||
        body.lines ||
        store.getState().receiptUploads.find((r) => r.id === receiptId)?.items || [
          { canonicalName: "Basmati Rice", quantity: 5, unit: "kg", confirmed: true },
          { canonicalName: "Chicken", quantity: 700, unit: "g", confirmed: true },
          { canonicalName: "Onion", quantity: 2, unit: "kg", confirmed: true },
          { canonicalName: "Curd", quantity: 200, unit: "ml", confirmed: true },
        ];

    const normalizedItems = rawItems.map((item: any) => ({
      id: item.id,
      matchedResourceId: item.matchedResourceId,
      canonicalName: item.canonicalName || item.name || "Item",
      quantity: Number(item.quantity || 1),
      unit: item.unit || "g",
      priceInr: item.priceInr,
      expiryDate: item.expiryDate,
      confirmed:
        typeof item.confirmed === "boolean"
          ? item.confirmed
          : typeof item.included === "boolean"
            ? item.included
            : true,
    }));

    const parsed = ConfirmReceiptInputSchema.parse({
      householdId: body.householdId || "hh_demo_001",
      idempotencyKey: body.idempotencyKey,
      vendorName: body.vendorName,
      items: normalizedItems,
    });

    const result = commitReceiptItems(store, receiptId, parsed);
    const { forecasts } = runForecastEngine(store, parsed.householdId);

    broadcastRealtime("INVENTORY_UPDATED", {
      eventId: result.eventId,
      receiptId,
    });

    return {
      ok: true,
      added: normalizedItems.filter((i: any) => i.confirmed).length,
      ...result,
      forecasts,
    };
  };

  const confirmThenCheck = afterInventoryChange("Groceries added", handleReceiptConfirm);
  app.post("/api/receipts/:id/confirm", confirmThenCheck);
  app.post("/api/receipts/confirm", confirmThenCheck);
  app.post("/api/inventory/purchases", confirmThenCheck);

  // ==========================================================================
  // 5. Recipes, Meal Simulation & Meal Commit Endpoints
  // ==========================================================================

  app.get("/api/recipes", async (request) => {
    const query =
      (request.query as { householdId?: string; search?: string }) || {};
    const householdId = query.householdId || "hh_demo_001";
    let recipes = store
      .getState()
      .recipes.filter((r) => r.householdId === householdId);

    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      recipes = recipes.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.aliases.some((a) => a.toLowerCase().includes(q))
      );
    }

    return {
      recipes: recipes.map((r) => ({
        ...r,
        cuisine: "South Indian",
        servings: r.defaultServings,
        ingredients: r.ingredients.map((ing) => ({
          ...ing,
          itemId: ing.resourceId,
          name: ing.resourceName,
          quantityPerServing: ing.qtyPerServing,
          unit: ing.baseUnit,
        })),
      })),
    };
  });

  app.post("/api/meals/simulate", async (request) => {
    const body = (request.body as Record<string, unknown>) || {};
    const input = MealSimulationInputSchema.parse({
      ...body,
      recipeId: mapRecipeIdAlias(
        typeof body.recipeId === "string" ? body.recipeId : undefined
      ),
    });
    const simulation = simulateMeal(store, input);

    return {
      ...simulation,
      recipeId: simulation.recipe.id,
      recipeName: simulation.recipe.name,
      rows: simulation.ingredients.map((ing) => ({
        itemId: ing.resourceId,
        name: ing.name,
        required: ing.requiredQty,
        unit: ing.baseUnit,
        available: ing.netAvailableQty,
        status: ing.status === "SURPLUS" ? "AVAILABLE" : ing.status,
        shortfall: ing.deficitQty > 0 ? ing.deficitQty : undefined,
      })),
    };
  });

  app.post("/api/meals/commit", async (request) => {
    const body = (request.body as Record<string, unknown>) || {};
    const input = MealCommitInputSchema.parse({
      ...body,
      recipeId: mapRecipeIdAlias(
        typeof body.recipeId === "string" ? body.recipeId : undefined
      ),
    });
    const result = await runMealPlanningWorkflow(
      store,
      input,
      broadcastRealtime
    );
    return {
      ok: true,
      ...result,
    };
  });

  app.post("/api/meals/:id/consume", afterInventoryChange("Meal cooked", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { householdId?: string }) || {};
    const householdId = body.householdId || "hh_demo_001";
    try {
      const result = consumeMealIngredients(store, id, householdId);
      broadcastRealtime("MEAL_CONSUMED", {
        householdId,
        mealPlanId: id,
        eventId: result.eventId,
      });
      return { ok: true, ...result };
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : "Failed to consume meal",
      });
    }
  }));

  // ==========================================================================
  // 6. Ripple Graph, Counterfactual Simulation & "Why?" Evidence Endpoints
  // ==========================================================================

  app.post("/api/ripple/simulate", async (request) => {
    const body = (request.body as Record<string, unknown>) || {};
    const input = CounterfactualSimulationInputSchema.parse({
      ...body,
      recipeId:
        mapRecipeIdAlias(
          typeof body.recipeId === "string" ? body.recipeId : undefined
        ) || "rcp_chicken_biryani",
    });
    const result = simulateCounterfactualRipple(store, input);
    return {
      ...result,
      simulatedRippleGraph: enrichRippleGraphWithFrontendShape(
        result.simulatedRippleGraph
      ),
    };
  });

  const handleGetRipple = async (request: any, reply: any) => {
    const params = (request.params as { eventId?: string }) || {};
    const query = (request.query as { eventId?: string }) || {};
    const eventId = params.eventId || query.eventId || "latest";

    let graph = getRippleGraphByEventId(store, eventId);
    if (!graph) {
      // Demo mode plans a sample dinner so the ripple screen has something to show.
      // A signed-in household must never get a meal it did not plan.
      if (ownsHousehold()) return reply.code(404).send({ error: "No ripple yet. Plan a meal to see what it changes." });
      const sim = simulateMeal(store, {
        householdId: "hh_demo_001",
        recipeId: "rcp_chicken_biryani",
        servings: 6,
        mealSlot: "dinner",
      });
      const preview = await runMealPlanningWorkflow(
        store,
        {
          householdId: "hh_demo_001",
          recipeId: sim.recipe.id,
          servings: 6,
          mealSlot: "dinner",
          source: "ui",
        },
        broadcastRealtime
      );
      graph = preview.rippleGraph;
    }

    return enrichRippleGraphWithFrontendShape(graph);
  };

  app.get("/api/ripples/:eventId", handleGetRipple);
  app.get("/api/ripple/:eventId", handleGetRipple);
  app.get("/api/ripples", handleGetRipple);

  app.get("/api/why/:itemId", async (request) => {
    const { itemId } = request.params as { itemId: string };
    const canonicalId = mapResourceIdAlias(itemId);
    const latestRipple = store.getState().rippleGraphs["latest"];
    const whyEv =
      latestRipple?.explanations.find((e) => e.resourceId === canonicalId) ||
      latestRipple?.explanations[0];

    if (whyEv) {
      return {
        summary: whyEv.headline,
        rows: [
          { label: "Required", value: whyEv.requiredDisplay },
          { label: "Available", value: whyEv.onHandDisplay },
          { label: "Difference", value: whyEv.deficitDisplay },
        ],
        sources: whyEv.sources,
        whyEvidence: whyEv,
      };
    }

    return {
      summary: "Tomorrow's biryani needs more chicken than we have.",
      rows: [
        { label: "Required", value: "1.5 kg" },
        { label: "Available", value: "700 g" },
        { label: "Difference", value: "800 g" },
      ],
      sources: [
        "Meal plan · Chicken Biryani × 6",
        "Confirmed inventory lot #lot_seed_chicken",
        "Preferred vendor · Kaveri Fresh Mart",
      ],
    };
  });

  // ==========================================================================
  // 7. Obligations & Forecasts Endpoints
  // ==========================================================================

  app.get("/api/obligations", async (request) => {
    const query = (request.query as { householdId?: string }) || {};
    const householdId = query.householdId || "hh_demo_001";
    const { obligations, forecasts } = runForecastEngine(store, householdId);
    return { obligations, forecasts };
  });

  // Obligation ingestion pipeline: documents · bills · appointments ·
  // vehicle service · subscriptions (Supervisor → IntakeAgent → ledger).
  app.post("/api/obligations/ingest", async (request, reply) => {
    const body = ObligationIngestInputSchema.parse(request.body ?? {});
    const structured =
      body.kind && body.title
        ? {
            kind: body.kind,
            title: body.title,
            ...(body.provider ? { provider: body.provider } : {}),
            ...(body.detail ? { detail: body.detail } : {}),
            ...(body.dueDate ? { dueDate: body.dueDate } : {}),
            ...(body.amountInr != null ? { amountInr: body.amountInr } : {}),
            ...(body.recurrence ? { recurrence: body.recurrence } : {}),
          }
        : undefined;
    const result = await runObligationIngestWorkflow(store, {
      householdId: body.householdId,
      structured,
      rawText: body.rawText,
      source: body.source,
      idempotencyKey: body.idempotencyKey,
      onBroadcast: broadcastRealtime,
    });
    return reply.status(201).send(result);
  });

  app.get("/api/forecasts", async (request) => {
    const query = (request.query as { householdId?: string }) || {};
    const householdId = query.householdId || "hh_demo_001";
    const { forecasts } = runForecastEngine(store, householdId);
    return {
      forecasts: forecasts.map((f) => ({
        ...f,
        itemId: f.targetId,
        itemName: f.targetName,
        type: f.riskType,
        detail: f.explanation,
        horizonDays: f.daysRemaining,
        severity: f.severity.toLowerCase(),
      })),
    };
  });

  // ==========================================================================
  // 8. Actions, Approvals & Snapserve Execution Endpoints
  // ==========================================================================

  // Resolve the active SnapServe agent's caller number shortly after boot so
  // every action payload can show "which number the vendor will see".
  // Fire-and-forget: resolution is best-effort and demo mode stays null.
  let snapserveAgentNumber: string | null = null;
  if (isSnapserveLive()) {
    void (async () => {
      try {
        const agent = await resolveSnapserveAgent();
        snapserveAgentNumber = agent
          ? await resolveSnapserveAgentNumber(agent.id)
          : null;
      } catch {
        // Number display is cosmetic — never break boot over it
      }
    })();
  }

  const enrichActionWithFrontendShape = (a: any) => {
    const firstEv = a.whyEvidence?.[0];
    const snapserveStateMap: Record<string, string> = {
      PREPARING: "Preparing",
      CALLING: "Calling",
      CONNECTED: "Connected",
      AWAITING_RESPONSE: "Awaiting response",
      CONFIRMED: "Confirmed",
      FAILED: "Failed",
      UNKNOWN: "Unknown",
    };
    const frontendStatusMap: Record<string, string> = {
      PENDING_APPROVAL: "proposed",
      APPROVED: "approved",
      EXECUTING: "executing",
      CONFIRMED: "confirmed",
      FAILED: "failed",
      REJECTED: "rejected",
    };

    return {
      ...a,
      frontendStatus: frontendStatusMap[a.status] || "proposed",
      kind: "purchase" as const,
      quantity:
        a.items?.map((i: any) => `${i.orderDisplay} ${i.name}`).join(" + ") ||
        "800 g Chicken",
      reason: a.reasonSummary,
      evidence: {
        required: firstEv?.requiredDisplay || "1.5 kg",
        available: firstEv?.onHandDisplay || "700 g",
        deficit: firstEv?.deficitDisplay || "800 g",
      },
      vendor: a.targetVendor?.name || "Kaveri Fresh Mart",
      estimatedCost: `₹${a.estimatedTotalCostInr}`,
      origin: a.origin ?? null,
      // One row per item, so a multi-item restock shows why each item is on it.
      evidenceLines: (a.whyEvidence ?? []).map((e: any) => ({
        name: e.resourceName ?? e.targetLabel ?? "",
        headline: e.headline,
        available: e.onHandDisplay,
        order: e.deficitDisplay,
      })),
      execution: a.externalCallStatus
        ? {
            state: snapserveStateMap[a.externalCallStatus] || "Confirmed",
            detail: a.outcome?.vendorResponseSummary,
            transcript: a.outcome?.transcript,
            deliveryEta: a.outcome?.deliveryEta,
          }
        : null,
      snapserve: {
        live: isSnapserveLive(),
        agentNumber: snapserveAgentNumber,
      },
    };
  };

  // Order from the app in plain words ("2 kg rice; 1 litre milk"): the same path as a
  // phone order. Asking for it here is the approval, so each store is called straight away.
  app.post("/api/orders", async (request, reply) => {
    const body = OrderRequestSchema.parse(request.body ?? {});
    const result = await runVoiceOrderWorkflow(store, {
      callId: `app_${crypto.randomUUID().slice(0, 8)}`,
      callerPhone: "app",
      orderText: body.items,
      preferredStore: body.store ?? null,
      deliveryNote: body.delivery ?? null,
      approverUserId: currentUser()?.userId ?? "usr_sai_001",
      stepDelayMs: 0,
      onBroadcast: broadcastRealtime,
    });
    if (result.actions.length === 0) {
      return reply.code(422).send({
        error: result.unassigned.length
          ? `No store sells: ${result.unassigned.join(", ")}. Add a store first.`
          : "I couldn't understand the items. Try \"2 kg rice; 1 litre milk\".",
      });
    }
    return {
      actions: result.actions.map(enrichActionWithFrontendShape),
      unassigned: result.unassigned,
    };
  });

  // Manual / cron trigger for the restock check (e.g. a Vercel cron, where no timer runs).
  app.post("/api/reorders/scan", async () => {
    const result = await checkReorders("Manual inventory check");
    if (!result) return { ok: false, created: [], pending: [], withdrawn: [], unassigned: [] };
    return {
      ok: true,
      created: result.created.map(enrichActionWithFrontendShape),
      pending: result.pending.map(enrichActionWithFrontendShape),
      withdrawn: result.withdrawnIds,
      unassigned: result.unassigned,
    };
  });

  app.get("/api/actions", async (request) => {
    const query =
      (request.query as { householdId?: string; status?: string }) || {};
    const householdId = query.householdId || "hh_demo_001";
    // Expiry is time-based, so opening Actions re-checks stock before listing.
    await checkReorders("Actions opened");
    const state = store.getState();
    let actions = state.actions.filter((a) => a.householdId === householdId);

    if (query.status && query.status !== "ALL") {
      actions = actions.filter((a) => a.status === query.status);
    }

    return {
      actions: actions.map((a) => ({
        ...enrichActionWithFrontendShape(a),
        expectations: (state.expectations || []).filter(
          (e) => e.actionId === a.id
        ),
      })),
    };
  });

  app.get("/api/verification/expectations", async (request) => {
    const query =
      (request.query as { householdId?: string; actionId?: string }) || {};
    const householdId = query.householdId || "hh_demo_001";
    let expectations = (store.getState().expectations || []).filter(
      (e) => e.householdId === householdId
    );
    if (query.actionId) {
      expectations = expectations.filter((e) => e.actionId === query.actionId);
    }
    return { expectations };
  });

  app.post("/api/verification/reconcile-delivery", afterInventoryChange("Delivery checked", async (request) => {
    const body = (request.body as Record<string, unknown>) || {};
    const input = VerifyDeliveryInputSchema.parse(body);
    const result = verifyPhysicalDelivery(store, input);
    broadcastRealtime("DELIVERY_RECONCILED", {
      householdId: input.householdId,
      actionId: input.actionId,
      hasDiscrepancy: result.hasDiscrepancy,
      followUpActionId: result.followUpActionId,
    });
    return {
      ok: true,
      ...result,
    };
  }));

  /** Approvals being executed in this process, so a double tap cannot start a second call. */
  const actionsInFlight = new Set<string>();

  const handleApproveAndExecuteAction = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const body =
      (request.body as {
        userId?: string;
        idempotencyKey?: string;
        stepDelayMs?: number;
        asyncExecution?: boolean;
        deferCompletion?: boolean;
      }) || {};

    let existing = store.getState().actions.find((a) => a.id === id);
    if (!existing && id === "act_001") {
      existing = store.getState().actions[0];
    }
    if (!existing) {
      return reply.status(404).send({ error: `Action not found: ${id}` });
    }

    const targetActionId = existing.id;
    // Bind the approval token to the signed-in user, not whatever the client sends.
    const approverId = currentUser()?.userId ?? body.userId ?? "usr_sai_001";

    // Each approval places at most one call: repeat or late requests (a double
    // tap, the UI's follow-up /complete) report the current state instead.
    // "APPROVED" without approvedAt comes from deferCompletion (no token, no call yet).
    const claimKey = `${currentUser()?.userId ?? "demo"}:${targetActionId}`;
    const executable =
      (existing.status === "PENDING_APPROVAL" || (existing.status === "APPROVED" && !existing.approvedAt)) &&
      !actionsInFlight.has(claimKey);
    if (!executable) {
      if (existing.status === "REJECTED") {
        return reply.status(409).send({ error: "This action was rejected.", action: enrichActionWithFrontendShape(existing) });
      }
      return {
        actionId: targetActionId,
        status: existing.status,
        alreadyProcessed: true,
        live: isSnapserveLive(),
        action: enrichActionWithFrontendShape(existing),
        steps: [],
      };
    }

    if (body.deferCompletion) {
      const now = new Date();
      const nowIso = now.toISOString();
      const approved = store.mutate((draft) => {
        const act = draft.actions.find((a) => a.id === targetActionId)!;
        act.status = "APPROVED";
        act.externalCallStatus = "PREPARING";
        act.updatedAt = nowIso;
        return act;
      });
      broadcastRealtime("ACTION_APPROVED", { actionId: targetActionId });
      return {
        actionId: targetActionId,
        status: "APPROVED",
        action: enrichActionWithFrontendShape(approved),
        steps: [
          { state: "Calling", afterMs: 900 },
          { state: "Connected", afterMs: 1800 },
          { state: "Awaiting response", afterMs: 2700 },
          { state: "Confirmed", afterMs: 3800 },
        ],
      };
    }

    if (body.asyncExecution) {
      // Real call: a phone dial takes 30–120s, far past HTTP timeouts — the
      // UI follows progress over SSE (SNAPSERVE_CALL_PROGRESS) instead of a
      // canned step timeline.
      const liveCall = isSnapserveLive();
      actionsInFlight.add(claimKey);
      void runActionApprovalAndExecutionWorkflow(store, {
        actionId: targetActionId,
        userId: approverId,
        idempotencyKey: body.idempotencyKey,
        stepDelayMs: body.stepDelayMs ?? (liveCall ? 0 : 900),
        onBroadcast: broadcastRealtime,
      })
        .catch((err) => app.log.warn({ err, actionId: targetActionId }, "vendor call workflow failed"))
        .finally(() => actionsInFlight.delete(claimKey));

      return {
        actionId: targetActionId,
        status: "EXECUTING",
        approvalTokenIssued: true,
        live: liveCall,
        ...(liveCall
          ? {}
          : {
              steps: [
                { state: "Calling", afterMs: 900 },
                { state: "Connected", afterMs: 1800 },
                { state: "Awaiting response", afterMs: 2700 },
                { state: "Confirmed", afterMs: 3800 },
              ],
            }),
        message: liveCall
          ? `Approval verified. SnapServe agent${
              snapserveAgentNumber ? ` (line ${snapserveAgentNumber})` : ""
            } is dialing ${
              existing.targetVendor?.name || "the vendor"
            } now — live status is streaming.`
          : "Approval verified. Snapserve outbound call started.",
      };
    }

    actionsInFlight.add(claimKey);
    const result = await runActionApprovalAndExecutionWorkflow(store, {
      actionId: targetActionId,
      userId: approverId,
      idempotencyKey: body.idempotencyKey,
      stepDelayMs: body.stepDelayMs ?? 150,
      onBroadcast: broadcastRealtime,
    }).finally(() => actionsInFlight.delete(claimKey));

    return {
      ...result,
      action: enrichActionWithFrontendShape(result.action),
      approvalTokenIssued: true,
      steps: [
        { state: "Calling", afterMs: 900 },
        { state: "Connected", afterMs: 1800 },
        { state: "Awaiting response", afterMs: 2700 },
        { state: "Confirmed", afterMs: 3800 },
      ],
    };
  };

  app.post("/api/actions/:id/approve", handleApproveAndExecuteAction);
  app.post("/api/actions/:id/execute", handleApproveAndExecuteAction);
  app.post("/api/actions/:id/complete", handleApproveAndExecuteAction);

  // ── SnapServe voice agent surface ────────────────────────────────────────

  // Live call status for one action (what the ExecutionEngine last saw).
  app.get("/api/actions/:id/snapserve-status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const act = store.getState().actions.find((a) => a.id === id);
    if (!act) return reply.status(404).send({ error: `Action not found: ${id}` });
    return {
      actionId: act.id,
      externalCallId: act.externalCallId,
      status: act.externalCallStatus,
      callSteps: act.callSteps,
      transcript: act.outcome?.transcript ?? null,
      humanizedSummary: act.outcome?.vendorResponseSummary ?? null,
      deliveryEta: act.outcome?.deliveryEta ?? null,
      agentNumber: snapserveAgentNumber,
      live: isSnapserveLive(),
    };
  });

  // SnapServe webhook receiver: POST {timestamp}.{rawBody} signed with
  // X-Snapserve-Signature (HMAC-SHA256). Handles call.completed / call.failed.
  app.post(
    "/api/webhooks/snapserve",
    { config: { rawBody: true } },
    async (request, reply) => {
      const rawBody =
        (request as unknown as { rawBody?: string | Buffer }).rawBody?.toString() ??
        "";
      const signature =
        (request.headers["x-snapserve-signature"] as string | undefined) ??
        (request.headers["x-snapserve-signature"] as string | undefined);
      const secret = process.env.SNAPSERVE_WEBHOOK_SECRET || "";

      if (secret && !verifySnapserveWebhookSignature(rawBody, signature, secret)) {
        return reply.status(401).send({ error: "Invalid webhook signature." });
      }

      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return reply.status(400).send({ error: "Malformed webhook payload." });
      }

      const eventType = String(body.event ?? body.type ?? "");
      const call = (body.data ?? body.call ?? body) as Record<string, unknown>;
      const externalCallId = String(call.id ?? call.call_id ?? "");
      const callStatus = String(call.status ?? "");

      if (externalCallId) {
        const apply = () => {
          store.mutate((draft) => {
            const act = draft.actions.find(
              (a) => a.externalCallId === externalCallId
            );
            if (!act) return;
            if (callStatus === "completed" || callStatus === "failed") {
              act.externalCallStatus =
                callStatus === "completed" ? "CONFIRMED" : "FAILED";
              act.updatedAt = new Date().toISOString();
              act.callSteps.push({
                status: act.externalCallStatus,
                label:
                  callStatus === "completed"
                    ? "SnapServe webhook: call completed"
                    : "SnapServe webhook: call failed",
                timestamp: new Date().toISOString(),
              });
            }
          });
          broadcastRealtime("SNAPSERVE_STATUS", {
            actionId: externalCallId,
            callStatus,
          });
        };
        // The webhook carries no session, so find whose action this call belongs to.
        const owner = userStores && !currentUser() ? await userStores.findByCall(externalCallId) : null;
        if (owner) {
          runWithUser(owner, apply);
          await userStores?.flush(owner.userId);
        }
        else if (!userStores) apply();
      }

      return { received: true };
    }
  );

  app.post("/api/actions/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body =
      (request.body as { userId?: string; reason?: string }) || {};
    const existing = store.getState().actions.find((a) => a.id === id);
    if (!existing) {
      return reply.status(404).send({ error: `Action not found: ${id}` });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const updated = store.mutate(
      (draft) => {
        const act = draft.actions.find((a) => a.id === id)!;
        act.status = "REJECTED";
        act.updatedAt = nowIso;

        draft.timeline.unshift({
          id: `tl_rej_${id}`,
          householdId: act.householdId,
          eventId: act.sourceEventId,
          timestamp: nowIso,
          timeFormatted: now.toTimeString().slice(0, 5),
          title: "Action rejected",
          description: `${act.title} (${body.reason || "Dismissed by user"})`,
          category: "action",
          status: "INFO",
          relatedActionId: act.id,
        });

        return act;
      },
      {
        householdId: existing.householdId,
        actor: body.userId || "usr_sai_001",
        operation: "ACTION_REJECTED",
        entityType: "Action",
        entityId: id,
      }
    );

    broadcastRealtime("ACTION_REJECTED", { actionId: id });
    return { ok: true, action: enrichActionWithFrontendShape(updated) };
  });

  // ==========================================================================
  // 9. Voice Transcription & Natural Event Ingest Endpoints (Sarvam AI)
  // ==========================================================================

  const handleVoiceOrEventIngest = async (request: any) => {
    let audioBuffer: Buffer | undefined;
    let mimeType: string | undefined;
    let transcriptOverride: string | undefined;
    let languageCode = "ta-IN";
    let autoSimulate = true;
    let autoCommit = false;
    let householdId = "hh_demo_001";

    if (request.isMultipart && request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          audioBuffer = await part.toBuffer();
          mimeType = part.mimetype;
        } else if (part.type === "field") {
          if (part.fieldname === "transcriptOverride" || part.fieldname === "text") {
            transcriptOverride = String(part.value);
          } else if (part.fieldname === "languageCode") {
            languageCode = String(part.value);
          } else if (part.fieldname === "autoCommit") {
            autoCommit = String(part.value) === "true";
          } else if (part.fieldname === "householdId") {
            householdId = String(part.value);
          }
        }
      }
    } else if (request.body && typeof request.body === "object") {
      const b = request.body as Record<string, unknown>;
      transcriptOverride =
        typeof b.transcriptOverride === "string"
          ? b.transcriptOverride
          : typeof b.text === "string"
            ? b.text
            : typeof b.utterance === "string"
              ? b.utterance
              : undefined;
      if (typeof b.languageCode === "string") languageCode = b.languageCode;
      if (typeof b.autoSimulate === "boolean") autoSimulate = b.autoSimulate;
      if (typeof b.autoCommit === "boolean") autoCommit = b.autoCommit;
      if (typeof b.householdId === "string") householdId = b.householdId;
    }

    return runVoiceIntakeWorkflow(store, {
      householdId,
      audioBuffer,
      mimeType,
      languageCode,
      transcriptOverride,
      autoSimulate,
      autoCommit,
      onBroadcast: broadcastRealtime,
    });
  };

  app.post("/api/voice/transcribe", handleVoiceOrEventIngest);
  app.post("/api/events/ingest", handleVoiceOrEventIngest);

  // ==========================================================================
  // 10. Activity Timeline, Agent Traces & Household Settings Endpoints
  // ==========================================================================

  const handleGetTimeline = async (request: any) => {
    const query =
      (request.query as { householdId?: string; limit?: string }) || {};
    const householdId = query.householdId || "hh_demo_001";
    const limit = Number(query.limit || 30);
    const state = store.getState();

    const entries = state.timeline
      .filter((t) => t.householdId === householdId)
      .slice(0, limit)
      .map((t) => ({
        ...t,
        time: t.timeFormatted,
        kind:
          t.category === "shortage"
            ? "alert"
            : t.category === "reconciliation"
              ? "agent"
              : t.category,
      }));

    return {
      entries,
      agentRuns: state.agentRuns.filter((r) => r.householdId === householdId),
    };
  };

  app.get("/api/timeline", handleGetTimeline);
  app.get("/api/activity", handleGetTimeline);

  app.get("/api/agent-trace", async () => {
    const latestRun = store.getState().agentRuns[0];
    if (latestRun && latestRun.steps.length > 0) {
      return {
        run: latestRun,
        steps: latestRun.steps.map((s) => ({
          agent: s.agentName,
          detail: `${s.action} (${s.latencyMs}ms)`,
          reason: s.reason,
          toolCalls: s.toolCalls,
        })),
      };
    }

    return {
      steps: [
        { agent: "Supervisor", detail: "Classified request · meal planning intent" },
        { agent: "IntakeAgent", detail: "Parsed Tanglish voice into MEAL_PLANNED" },
        { agent: "MealEngine", detail: "Scaled Chicken Biryani × 6 deterministically" },
        { agent: "RippleEngine", detail: "Found 800 g chicken & 100 ml curd shortages" },
        { agent: "ForecastEngine", detail: "Updated depletion & expiry risk models" },
        { agent: "ActionPlannerAgent", detail: "Prepared vendor order with 'Why?' proof" },
      ],
    };
  });

  app.get("/api/household", async (request) => {
    const query = (request.query as { householdId?: string }) || {};
    const householdId = query.householdId || "hh_demo_001";
    const state = store.getState();
    return {
      household:
        state.households.find((h) => h.id === householdId) ||
        state.households[0],
      members: state.members.filter((m) => m.householdId === householdId),
      vendors: state.vendors.filter((v) => v.householdId === householdId),
    };
  });

  app.get("/api/members", async (request) => {
    const query = (request.query as { householdId?: string }) || {};
    const householdId = query.householdId || "hh_demo_001";
    return {
      members: store
        .getState()
        .members.filter((m) => m.householdId === householdId),
    };
  });

  // ==========================================================================
  // 11. Unified Single-Port Production SPA Static Asset Serving
  // ==========================================================================

  const candidateDistDirs = [
    path.resolve(process.cwd(), "apps/web/dist"),
    path.resolve(process.cwd(), "../web/dist"),
    path.resolve(process.cwd(), "../../apps/web/dist"),
  ];
  const resolvedDistDir = candidateDistDirs.find((d) => fs.existsSync(d));

  if (resolvedDistDir) {
    const mimeByExt: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".webmanifest": "application/manifest+json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
    };

    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.status(404).send({ error: `Route not found: ${request.url}` });
      }

      const urlPath = (request.url.split("?")[0] || "/").replace(/^\/+/, "");
      const candidatePath = path.resolve(resolvedDistDir, urlPath);

      if (
        urlPath &&
        candidatePath.startsWith(resolvedDistDir) &&
        fs.existsSync(candidatePath) &&
        fs.statSync(candidatePath).isFile()
      ) {
        const ext = path.extname(candidatePath).toLowerCase();
        reply.header(
          "Content-Type",
          mimeByExt[ext] || "application/octet-stream"
        );
        if (urlPath.startsWith("assets/")) {
          reply.header("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          reply.header("Cache-Control", "public, max-age=3600");
        }
        return reply.send(fs.readFileSync(candidatePath));
      }

      const indexHtmlPath = path.join(resolvedDistDir, "index.html");
      if (fs.existsSync(indexHtmlPath)) {
        reply.header("Content-Type", "text/html; charset=utf-8");
        reply.header("Cache-Control", "no-cache");
        return reply.send(fs.readFileSync(indexHtmlPath));
      }

      return reply.status(404).send({ error: "Not found" });
    });
  }

  return app;
}
