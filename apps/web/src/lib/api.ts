// Typed API layer (Design System §30). Connects the React frontend to the
// Fastify backend (`apps/api` via `/api` proxy or `VITE_API_BASE_URL`), with
// graceful fallback to the deterministic seed store if the server is offline.

import * as seed from "../mocks/data";
import type {
  ActionItem,
  ActionStatus,
  ActivityEntry,
  AgentStep,
  CounterfactualSimulationData,
  DashboardData,
  ExpectationItem,
  Forecast,
  InventoryItem,
  MealSimulation,
  MealSimulationRow,
  Obligation,
  ObligationDomain,
  ObligationStatus,
  Recipe,
  RippleGraph,
  SnapserveState,
  StateTransitionItem,
} from "../mocks/types";

export const API_BASE =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env?.VITE_API_BASE_URL === "string" &&
  import.meta.env.VITE_API_BASE_URL.length > 0
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")
    : "/api";

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (init?.body && typeof init.body === "string") {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Realtime SSE Subscription ──────────────────────────────────────────────

export function subscribeToHouseholdEvents(
  onEvent: (eventType: string, payload: Record<string, unknown>) => void,
): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }

  const es = new EventSource(`${API_BASE}/events/stream`);
  const eventTypes = [
    "CONNECTED",
    "RECEIPT_CONFIRMED",
    "VOICE_INGESTED",
    "MEAL_COMMITTED",
    "MEAL_CONSUMED",
    "ACTION_APPROVED",
    "ACTION_REJECTED",
    "SNAPSERVE_STATUS",
    "ACTION_RECONCILED",
    "DELIVERY_RECONCILED",
    "DEMO_RESET",
  ];

  const handlers = eventTypes.map((type) => {
    const handler = (evt: MessageEvent) => {
      try {
        const parsed = JSON.parse(evt.data) as Record<string, unknown>;
        onEvent(type, parsed);
      } catch {
        // Ignore malformed SSE frame
      }
    };
    es.addEventListener(type, handler as EventListener);
    return { type, handler };
  });

  return () => {
    for (const h of handlers) {
      es.removeEventListener(h.type, h.handler as EventListener);
    }
    es.close();
  };
}

// ── Fallback in-memory store (used only if backend server is offline) ───────

const store = {
  inventory: [...seed.inventory],
  actions: [...seed.actions],
  activity: [...seed.activity],
};

// ── Dashboard & Inventory ──────────────────────────────────────────────────

export async function getDashboard(): Promise<DashboardData> {
  const remote = await apiFetch<Record<string, unknown>>("/dashboard");
  if (remote && (remote.todayMeal || remote.todayMeals)) {
    const todayMeals = Array.isArray(remote.todayMeals)
      ? (remote.todayMeals as Array<Record<string, unknown>>)
      : [];
    const firstMeal = todayMeals[0];
    const invSummary = (remote.inventorySummary || {}) as Record<string, unknown>;
    const rawAttention = Array.isArray(remote.attentionItems)
      ? (remote.attentionItems as Array<Record<string, unknown>>)
      : [];
    const rawActivity = Array.isArray(remote.recentActivity)
      ? (remote.recentActivity as Array<Record<string, unknown>>)
      : [];

    const total = Number(invSummary.totalItems ?? invSummary.total ?? 10);
    const low = Number(invSummary.lowCount ?? invSummary.low ?? 2);
    const expiring = Number(invSummary.expiringSoonCount ?? invSummary.expiring ?? 2);

    return {
      stateVersion: Number(remote.stateVersion || 1),
      todayMeal: firstMeal
        ? {
            id: String(firstMeal.id || ""),
            recipeName: String(firstMeal.dishName || firstMeal.recipeName || "Chicken Biryani"),
            servings: Number(firstMeal.servings || 6),
            shortCount: Number(firstMeal.shortageCount ?? firstMeal.shortCount ?? 0),
            status: String(firstMeal.status || "PLANNED_SHORTAGE"),
          }
        : (remote.todayMeal as DashboardData["todayMeal"]) || {
            recipeName: "Chicken Biryani",
            servings: 6,
            shortCount: 2,
          },
      inventorySummary: {
        total,
        low,
        expiring,
        totalItems: total,
        lowStockCount: low,
        expiringSoonCount: expiring,
        reserved: Number(invSummary.reservedCount ?? 0),
        incoming: Number(invSummary.incomingCount ?? 0),
      },
      attentionItems: rawAttention.map((item) => ({
        id: String(item.id || ""),
        title: String(item.title || ""),
        description: String(item.subtitle || item.description || ""),
        href: String(item.href || "/ripple"),
      })),
      recentActivity: rawActivity.map((e) => ({
        id: String(e.id || ""),
        time: String(e.timeFormatted || e.time || ""),
        title: String(e.title || ""),
        description: String(e.description || ""),
        kind: (e.kind as ActivityEntry["kind"]) || "inventory",
      })),
    };
  }
  await delay(80);
  return seed.dashboard();
}

export async function getInventory(): Promise<InventoryItem[]> {
  const remote = await apiFetch<{ items: InventoryItem[] }>("/inventory");
  if (remote && Array.isArray(remote.items)) {
    return [...remote.items].sort((a, b) => a.name.localeCompare(b.name));
  }
  await delay(80);
  return [...store.inventory].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getInventoryItem(id: string): Promise<InventoryItem> {
  const remote = await apiFetch<InventoryItem>(`/inventory/${encodeURIComponent(id)}`);
  if (remote && remote.id && remote.name) {
    return remote;
  }
  await delay(60);
  const item = store.inventory.find((i) => i.id === id);
  if (!item) throw new Error(`Inventory item ${id} not found`);
  return item;
}

export async function getRecipes(): Promise<Recipe[]> {
  const remote = await apiFetch<{ recipes: Recipe[] }>("/recipes");
  if (remote && Array.isArray(remote.recipes)) {
    return remote.recipes;
  }
  await delay(60);
  return seed.recipes;
}

// ── Receipts ───────────────────────────────────────────────────────────────

export interface ExtractedReceiptScan {
  id: string;
  receiptId: string;
  vendor: string;
  vendorName: string;
  items: Array<{
    id?: string;
    matchedResourceId?: string | null;
    name: string;
    quantity: number;
    unit: string;
    confidence: "high" | "low";
  }>;
}

let latestReceiptId = "rcpt_001";

export async function uploadReceipt(options?: {
  imageBase64?: string;
  rawText?: string;
  vendorHint?: string;
}): Promise<ExtractedReceiptScan> {
  const remote = await apiFetch<{
    id: string;
    receiptId?: string;
    vendor?: string;
    vendorName?: string;
    items: Array<{
      id?: string;
      matchedResourceId?: string | null;
      name?: string;
      canonicalName?: string;
      rawName?: string;
      quantity: number;
      unit: string;
      confidence?: number | "high" | "low";
      confidenceLabel?: "high" | "low";
      needsReview?: boolean;
    }>;
  }>("/receipts/extract", {
    method: "POST",
    body: JSON.stringify({
      householdId: "hh_demo_001",
      ...(options?.imageBase64 ? { imageBase64: options.imageBase64 } : {}),
      ...(options?.rawText ? { rawText: options.rawText } : {}),
      ...(options?.vendorHint ? { vendorName: options.vendorHint } : {}),
    }),
  });

  if (remote && Array.isArray(remote.items)) {
    latestReceiptId = remote.receiptId || remote.id || "rcpt_001";
    const vendorName = remote.vendorName || remote.vendor || "Kaveri Fresh Mart";
    return {
      id: latestReceiptId,
      receiptId: latestReceiptId,
      vendor: vendorName,
      vendorName,
      items: remote.items.map((item) => {
        const confLabel: "high" | "low" =
          item.confidenceLabel ??
          (item.confidence === "low" || item.confidence === "high"
            ? item.confidence
            : item.needsReview ||
                (typeof item.confidence === "number" && item.confidence < 0.85)
              ? "low"
              : "high");
        return {
          id: item.id,
          matchedResourceId: item.matchedResourceId,
          name: item.name || item.canonicalName || item.rawName || "Item",
          quantity: item.quantity,
          unit: item.unit,
          confidence: confLabel,
        };
      }),
    };
  }

  await delay(800);
  const fallbackScan = seed.receiptScans[0];
  if (!fallbackScan) {
    return {
      id: "rcpt_001",
      receiptId: "rcpt_001",
      vendor: "FreshMart",
      vendorName: "FreshMart",
      items: [],
    };
  }
  return {
    ...fallbackScan,
    receiptId: fallbackScan.id,
    vendorName: fallbackScan.vendor,
  };
}

export interface ReceiptLineReview {
  id?: string;
  matchedResourceId?: string | null;
  name: string;
  quantity: number;
  unit: string;
  confidence: "high" | "low";
  included: boolean;
}

export async function confirmReceipt(lines: ReceiptLineReview[]): Promise<{
  ok: true;
  added: number;
  stateTransitions?: StateTransitionItem[];
}> {
  const remote = await apiFetch<{ ok: boolean; added: number }>(
    `/receipts/${encodeURIComponent(latestReceiptId)}/confirm`,
    {
      method: "POST",
      body: JSON.stringify({
        householdId: "hh_demo_001",
        items: lines.map((line) => ({
          id: line.id,
          matchedResourceId: line.matchedResourceId,
          canonicalName: line.name,
          name: line.name,
          quantity: line.quantity,
          unit: line.unit,
          confirmed: line.included,
        })),
      }),
    },
  );

  if (remote && remote.ok) {
    const diff = await getStateDiff().catch(() => null);
    return {
      ok: true as const,
      added: remote.added,
      stateTransitions: diff?.latestTransitions,
    };
  }

  await delay(400);
  return {
    ok: true as const,
    added: lines.filter((l) => l.included).length,
  };
}

// ── Meals ──────────────────────────────────────────────────────────────────

export async function simulateMeal(
  recipeId: string,
  servings: number,
): Promise<MealSimulation> {
  const remote = await apiFetch<MealSimulation>("/meals/simulate", {
    method: "POST",
    body: JSON.stringify({
      householdId: "hh_demo_001",
      recipeId,
      servings,
      mealSlot: "dinner",
    }),
  });

  if (remote && Array.isArray(remote.rows)) {
    return remote;
  }

  await delay(200);
  const recipe = seed.recipes.find((r) => r.id === recipeId);
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  const rows: MealSimulationRow[] = recipe.ingredients.map((ing) => {
    const item = store.inventory.find((i) => i.id === ing.itemId);
    const required = round2(ing.quantityPerServing * servings);
    const available = item?.quantity ?? 0;
    let status: MealSimulationRow["status"] = "AVAILABLE";
    let shortfall: number | undefined;
    if (available <= 0 || available < required * 0.5) {
      status = "MISSING";
      shortfall = round2(Math.max(0, required - available));
    } else if (available < required) {
      status = "LOW";
      shortfall = round2(required - available);
    }
    return {
      itemId: ing.itemId,
      name: ing.name,
      required,
      unit: ing.unit,
      available,
      status,
      shortfall,
    };
  });

  return { recipeId: recipe.id, recipeName: recipe.name, servings, rows };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function commitMeal(recipeId: string, servings: number): Promise<{
  ok: true;
  eventId?: string;
  mealPlanId?: string;
}> {
  const remote = await apiFetch<{
    ok: boolean;
    eventId?: string;
    mealPlanId?: string;
    mealPlan?: { id: string };
  }>("/meals/commit", {
    method: "POST",
    body: JSON.stringify({
      householdId: "hh_demo_001",
      recipeId,
      servings,
      mealSlot: "dinner",
      source: "ui",
    }),
  });

  if (remote && remote.ok) {
    return {
      ok: true as const,
      eventId: remote.eventId,
      mealPlanId: remote.mealPlanId || remote.mealPlan?.id || "mp_biryani_001",
    };
  }

  return { ok: true as const, eventId: "evt_meal_001", mealPlanId: "mp_biryani_001" };
}

export async function consumeMeal(mealPlanId: string) {
  const remote = await apiFetch<{ ok: boolean; eventId: string }>(
    `/meals/${encodeURIComponent(mealPlanId)}/consume`,
    {
      method: "POST",
      body: JSON.stringify({ householdId: "hh_demo_001" }),
    },
  );
  return remote ?? { ok: true, eventId: "evt_consume_001" };
}

// ── Voice & Demo Reset ─────────────────────────────────────────────────────

export interface VoiceTranscriptionResult {
  transcript: string;
  rawTranscript?: string;
  languageDetected?: string;
  dish: string;
  servings: number;
  plannedDate: string;
  eventId?: string;
  event?: {
    dish: string;
    servings: number;
    dateLabel: string;
  };
  simulationSummary?: {
    deficitCount: number;
    shortages: Array<{ name: string; deficitDisplay: string }>;
    actionProposed: boolean;
  };
}

export async function transcribeVoice(
  options?:
    | string
    | {
        audioBlob?: Blob;
        transcriptHint?: string;
        transcriptOverride?: string;
        languageCode?: string;
        autoCommit?: boolean;
      },
): Promise<VoiceTranscriptionResult> {
  const opts =
    typeof options === "string" ? { transcriptOverride: options } : options || {};
  const hint = opts.transcriptOverride || opts.transcriptHint;
  const shouldCommit = opts.autoCommit ?? true;

  type RawVoiceResponse = {
    rawTranscript?: string;
    languageDetected?: string;
    transcription?: { transcript?: string };
    structuredIntent?: {
      dish?: string;
      servings?: number;
      plannedDate?: string;
      dateLabel?: string;
    };
    simulation?: {
      shortageCount?: number;
      ingredients?: Array<{
        name: string;
        status: string;
        formattedDeficit: string;
      }>;
    };
    committedResult?: { eventId?: string };
  };

  let remote: RawVoiceResponse | null = null;

  if (opts.audioBlob && opts.audioBlob.size > 0) {
    const formData = new FormData();
    formData.append("file", opts.audioBlob, "voice.webm");
    formData.append("householdId", "hh_demo_001");
    formData.append("languageCode", opts.languageCode || "ta-IN");
    formData.append("autoSimulate", "true");
    formData.append("autoCommit", shouldCommit ? "true" : "false");
    if (hint) {
      formData.append("transcriptOverride", hint);
    }
    remote = await apiFetch<RawVoiceResponse>("/voice/transcribe", {
      method: "POST",
      body: formData,
    });
  } else {
    remote = await apiFetch<RawVoiceResponse>("/voice/transcribe", {
      method: "POST",
      body: JSON.stringify({
        householdId: "hh_demo_001",
        transcriptOverride: hint || seed.voiceUtterance.transcript,
        languageCode: opts.languageCode || "ta-IN",
        autoSimulate: true,
        autoCommit: shouldCommit,
      }),
    });
  }

  const transcript =
    remote?.rawTranscript ||
    remote?.transcription?.transcript ||
    hint ||
    seed.voiceUtterance.transcript;
  const dish = remote?.structuredIntent?.dish || "Chicken Biryani";
  const servings = Number(remote?.structuredIntent?.servings || 6);
  const dateLabel = remote?.structuredIntent?.dateLabel || "Tomorrow";

  const shortages = (remote?.simulation?.ingredients || [])
    .filter((i) => i.status === "SHORT" || i.status === "MISSING")
    .map((i) => ({
      name: i.name,
      deficitDisplay: i.formattedDeficit,
    }));
  const deficitCount = Number(
    remote?.simulation?.shortageCount ?? shortages.length,
  );

  return {
    transcript,
    rawTranscript: transcript,
    languageDetected: remote?.languageDetected || "ta-IN",
    dish,
    servings,
    plannedDate: dateLabel,
    eventId: remote?.committedResult?.eventId,
    event: {
      dish,
      servings,
      dateLabel,
    },
    simulationSummary: {
      deficitCount,
      shortages,
      actionProposed: deficitCount > 0,
    },
  };
}

export async function resetDemoState(
  mode: "pre-receipt" | "post-receipt" = "pre-receipt",
) {
  const remote = await apiFetch<{ ok: boolean }>("/demo/reset", {
    method: "POST",
    body: JSON.stringify({ householdId: "hh_demo_001", mode }),
  });

  store.inventory = [...seed.inventory];
  store.actions = [...seed.actions];
  store.activity = [...seed.activity];

  return { ok: remote?.ok ?? true };
}

export const resetDemo = resetDemoState;

// ── Ripple & Counterfactual State Forking ──────────────────────────────────

export async function getRipple(eventId: string): Promise<RippleGraph> {
  const target = !eventId || eventId === "evt_meal_001" ? "latest" : eventId;
  const remote = await apiFetch<RippleGraph>(
    `/ripples/${encodeURIComponent(target)}`,
  );
  if (remote && Array.isArray(remote.nodes)) {
    return remote;
  }
  await delay(250);
  return seed.buildBiryaniRipple();
}

export async function simulateCounterfactual(input: {
  recipeId?: string;
  servings: number;
  baselineServings?: number;
}): Promise<CounterfactualSimulationData> {
  const remote = await apiFetch<CounterfactualSimulationData>("/ripple/simulate", {
    method: "POST",
    body: JSON.stringify({
      householdId: "hh_demo_001",
      recipeId: input.recipeId || "rcp_chicken_biryani",
      servings: input.servings,
      baselineServings: input.baselineServings || 6,
    }),
  });
  if (!remote) {
    throw new Error("Counterfactual simulation failed");
  }
  return remote;
}

export async function getWhy(
  itemId: string,
): Promise<typeof seed.biryaniWhy> {
  const remote = await apiFetch<typeof seed.biryaniWhy>(
    `/why/${encodeURIComponent(itemId)}`,
  );
  if (remote && remote.summary && Array.isArray(remote.rows)) {
    return remote;
  }
  await delay(150);
  return seed.biryaniWhy;
}

export async function getStateDiff(): Promise<{
  stateVersion: number;
  latestTransitions: StateTransitionItem[];
  recentTransitions: StateTransitionItem[];
  expectations: ExpectationItem[];
}> {
  const res = await apiFetch<{
    stateVersion: number;
    latestTransitions?: StateTransitionItem[];
    recentTransitions?: StateTransitionItem[];
    recentAudits?: Array<{ transitions?: StateTransitionItem[] }>;
    expectations?: ExpectationItem[];
  }>("/state/diff");

  const normalize = (list: StateTransitionItem[]): StateTransitionItem[] =>
    list.map((t) => ({
      ...t,
      entityName: t.entityName || t.entityLabel,
    }));

  const latest = normalize(res?.latestTransitions || []);
  const fromAudits = normalize(
    (res?.recentAudits || []).flatMap((a) => a.transitions || []),
  );
  const recent =
    res?.recentTransitions && res.recentTransitions.length > 0
      ? normalize(res.recentTransitions)
      : fromAudits.length > 0
        ? fromAudits
        : latest;

  return {
    stateVersion: res?.stateVersion || 1,
    latestTransitions: latest,
    recentTransitions: recent,
    expectations: res?.expectations || [],
  };
}

// ── Actions & Physical Delivery Verification ───────────────────────────────

interface BackendActionItem extends Omit<ActionItem, "status"> {
  status: string;
  frontendStatus?: ActionStatus;
}

function normalizeActionItem(item: BackendActionItem): ActionItem {
  const statusMap: Record<string, ActionStatus> = {
    PENDING_APPROVAL: "proposed",
    APPROVED: "approved",
    EXECUTING: "executing",
    CONFIRMED: "confirmed",
    FAILED: "failed",
    REJECTED: "rejected",
    proposed: "proposed",
    approved: "approved",
    executing: "executing",
    confirmed: "confirmed",
    failed: "failed",
    rejected: "rejected",
  };

  return {
    ...item,
    status: item.frontendStatus ?? statusMap[item.status] ?? "proposed",
  };
}

export async function getActions(): Promise<ActionItem[]> {
  const remote = await apiFetch<{ actions: BackendActionItem[] }>("/actions");
  if (remote && Array.isArray(remote.actions)) {
    return remote.actions.map(normalizeActionItem);
  }
  await delay(80);
  return [...store.actions];
}

export async function approveAction(id: string) {
  const remote = await apiFetch<{
    steps?: Array<{ state: SnapserveState; afterMs: number }>;
  }>(`/actions/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    body: JSON.stringify({
      userId: "usr_sai_001",
      stepDelayMs: 250,
    }),
  });

  if (remote && Array.isArray(remote.steps)) {
    return remote.steps;
  }

  return [
    { state: "Calling" as const, afterMs: 900 },
    { state: "Connected" as const, afterMs: 1800 },
    { state: "Awaiting response" as const, afterMs: 2700 },
    { state: "Confirmed" as const, afterMs: 3800 },
  ];
}

export async function rejectAction(id: string) {
  await apiFetch<{ ok: boolean }>(`/actions/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify({
      userId: "usr_sai_001",
      reason: "Dismissed in Actions UI",
    }),
  });
  return { ok: true as const };
}

export async function snapserveProgress(
  _action: ActionItem,
): Promise<Array<{ state: SnapserveState; afterMs: number }>> {
  return [
    { state: "Calling", afterMs: 900 },
    { state: "Connected", afterMs: 1800 },
    { state: "Awaiting response", afterMs: 2700 },
    { state: "Confirmed", afterMs: 3800 },
  ];
}

export async function completeSnapserve(id: string) {
  await apiFetch<{ action?: BackendActionItem }>(
    `/actions/${encodeURIComponent(id)}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        userId: "usr_sai_001",
        stepDelayMs: 10,
      }),
    },
  );
  return { ok: true as const };
}

export async function verifyDelivery(input: {
  actionId: string;
  mode: "EXACT_MATCH" | "SHORT_DELIVERY";
}): Promise<{
  ok: boolean;
  hasDiscrepancy: boolean;
  expectations: ExpectationItem[];
  followUpActionId?: string;
}> {
  const res = await apiFetch<{
    ok: boolean;
    hasDiscrepancy: boolean;
    expectations: ExpectationItem[];
    followUpActionId?: string;
  }>("/verification/reconcile-delivery", {
    method: "POST",
    body: JSON.stringify({
      householdId: "hh_demo_001",
      actionId: input.actionId,
      mode: input.mode,
    }),
  });
  return (
    res ?? {
      ok: true,
      hasDiscrepancy: input.mode === "SHORT_DELIVERY",
      expectations: [],
    }
  );
}

// ── Activity ───────────────────────────────────────────────────────────────

export async function getActivity(): Promise<ActivityEntry[]> {
  const remote = await apiFetch<{ entries: ActivityEntry[] }>("/activity");
  if (remote && Array.isArray(remote.entries)) {
    return remote.entries;
  }
  await delay(80);
  return [...store.activity];
}

export async function getAgentTrace(): Promise<AgentStep[]> {
  const remote = await apiFetch<{ steps: AgentStep[] }>("/agent-trace");
  if (remote && Array.isArray(remote.steps)) {
    return remote.steps;
  }
  await delay(100);
  return seed.agentTrace;
}

// ── Forecasts & Obligations ────────────────────────────────────────────────

export async function getForecasts(): Promise<Forecast[]> {
  const remote = await apiFetch<{ forecasts: Forecast[] }>("/forecasts");
  if (remote && Array.isArray(remote.forecasts)) {
    return remote.forecasts;
  }
  await delay(100);
  return seed.forecasts;
}

export async function getObligations(): Promise<Obligation[]> {
  const remote = await apiFetch<{
    obligations: Array<Record<string, unknown>>;
  }>("/obligations");

  if (remote && Array.isArray(remote.obligations)) {
    const domainMap: Record<string, ObligationDomain> = {
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

    const statusMap: Record<string, ObligationStatus> = {
      OVERDUE: "overdue",
      DUE_SOON: "due_soon",
      UPCOMING: "ok",
      COMPLETED: "ok",
    };

    return remote.obligations.map((o) => ({
      id: String(o.id || ""),
      domain: domainMap[String(o.category || "document")] || "document",
      title: String(o.title || ""),
      provider: String(o.dependentEntity || "Household Ledger"),
      detail: String(o.conflictDescription || o.subtitle || ""),
      dueDate:
        typeof o.dueDate === "string" ? o.dueDate.slice(0, 10) : undefined,
      amount:
        typeof o.amountInr === "number"
          ? `₹${o.amountInr.toLocaleString("en-IN")}`
          : undefined,
      recurrence: "monthly",
      status: statusMap[String(o.status || "DUE_SOON")] || "due_soon",
    }));
  }

  return seed.obligations;
}

// ── util ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


