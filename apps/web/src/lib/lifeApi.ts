// LIVORA AI client. Every call goes to the Fastify API (/api/...). Only when
// the API is unreachable does it fall back to an identical in-browser
// LifeService (same package the server runs), with state kept in localStorage.
import {
  LifeService,
  defaultLifeState,
  type LifeInputs,
  type LifeState,
  type ListingType,
  type ModuleId,
  type TransportMode,
  type WardrobeCategory,
} from "@household/life";
import type {
  AssistantAction,
  CartItem,
  OrderRequest,
  OrderingSetup,
  Vendor,
  StoreInput,
  StoreUpdate,
} from "@household/contracts";
import * as seed from "@/mocks/data";
import { API_BASE } from "./api";
import { authEnabled, authHeaders } from "./auth";

export type Overview = ReturnType<LifeService["overview"]>;
export type Summary = ReturnType<LifeService["summary"]>;
export type Mobility = ReturnType<LifeService["mobility"]>;
export type Circular = ReturnType<LifeService["circular"]>;
export type OccasionPlan = ReturnType<LifeService["occasionPlan"]>;
export type Notifications = ReturnType<LifeService["notifications"]>;
/** Rule-based answers carry no actions; API answers may report cart changes the assistant made. */
export type Answer = ReturnType<LifeService["ask"]> & {
  actions?: AssistantAction[];
  provider?: string;
  /** Store orders the agent prepared; each gets a "Call store" button. */
  orders?: Array<{ id: string; vendor: string; items: string; estimatedCost: string; status: string }>;
  /** App features the agent used to answer. */
  steps?: string[];
};
export type CatalogRecipeView = ReturnType<LifeService["recipes"]>[number];
export type Plans = ReturnType<LifeService["plans"]>;
export type SearchHit = ReturnType<LifeService["search"]>[number];
export type LeaveBy = ReturnType<LifeService["leaveBy"]>;
export type ChargePlan = ReturnType<LifeService["chargePlan"]>;

// ── Transport ──────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Returns the parsed body, `undefined` if the server is unreachable, throws on 4xx/5xx. */
async function request<T>(path: string, init?: RequestInit): Promise<T | undefined> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(await authHeaders()),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    return undefined;
  }
  const type = res.headers.get("content-type") ?? "";
  // The Vite proxy answers 404/5xx HTML (or empty) when the API process is down.
  if (!type.includes("application/json")) {
    if (res.status >= 500 || res.status === 404) {
      // Signed in, say what actually came back (a crash or timeout on the host) rather than "can't reach".
      if (authEnabled) throw new ApiError(res.status, `The server returned an error (HTTP ${res.status}). Try again in a moment.`);
      return undefined;
    }
    throw new ApiError(res.status, res.statusText);
  }
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 404 && path.startsWith("/")) return undefined;
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return body;
}

// ── Offline fallback (same engine, browser-side) ───────────────────────────

const STATE_KEY = "livora.offline.state";
let local: LifeService | null = null;

function seedInputs(): LifeInputs {
  return {
    obligations: seed.obligations,
    forecasts: seed.forecasts,
    inventory: seed.inventory,
    cart: seed.smartCart,
    weekly: seed.weeklyMealPlan,
  };
}

function offline(): LifeService {
  if (!local) {
    let saved: Partial<LifeState> | undefined;
    try {
      const raw = window.localStorage.getItem(STATE_KEY);
      saved = raw ? (JSON.parse(raw) as Partial<LifeState>) : undefined;
    } catch {
      saved = undefined;
    }
    local = new LifeService(seedInputs, { ...defaultLifeState(), ...saved });
  }
  return local;
}

function persist() {
  try {
    if (local) window.localStorage.setItem(STATE_KEY, JSON.stringify(local.state));
  } catch {
    /* storage unavailable */
  }
}

/** Signed in, the built-in offline sample data must never stand in for the user's own data. */
function unreachable(): never {
  throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
}

async function read<T>(path: string, fallback: (s: LifeService) => T): Promise<T> {
  const remote = await request<T>(path);
  if (remote !== undefined) return remote;
  if (authEnabled) unreachable();
  return fallback(offline());
}

async function write<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body: unknown,
  fallback: (s: LifeService) => T,
  headers?: Record<string, string>,
): Promise<T> {
  const remote = await request<T>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(headers ? { headers } : {}),
  });
  if (remote !== undefined) return remote;
  if (authEnabled) unreachable();
  const out = fallback(offline());
  persist();
  return out;
}

const idem = () => ({ "Idempotency-Key": crypto.randomUUID() });

// ── Life intelligence ──────────────────────────────────────────────────────

export const getOverview = () => read<Overview>("/life/overview", (s) => s.overview());
export const getSummary = () => read<Summary>("/life/summary", (s) => s.summary());
export const getStarters = async () =>
  (await read<{ questions: string[] }>("/life/starters", (s) => ({ questions: s.starters() }))).questions;

export const searchLife = async (q: string): Promise<SearchHit[]> =>
  (await read<{ hits: SearchHit[] }>(`/life/search?q=${encodeURIComponent(q)}`, (s) => ({ hits: s.search(q) }))).hits;

export const decideSuggestion = (input: { suggestionId: string; kind: string; decision: "accepted" | "rejected" }) =>
  write("/life/decisions", "POST", input, (s) => {
    s.decide(input.suggestionId, input.kind, input.decision);
    return { ok: true };
  });

export const resetLearning = () =>
  write("/life/decisions", "DELETE", undefined, (s) => {
    s.resetLearning();
    return { ok: true };
  });

export const setCollisionApplied = (id: string, enabled: boolean) =>
  write(`/life/collisions/${encodeURIComponent(id)}`, "PUT", { enabled }, (s) => {
    s.setCollisionApplied(id, enabled);
    return { ok: true };
  });

export interface AssistantTurn {
  q: string;
  a: string;
}

// The idempotency key keeps a retried request from applying a cart change twice.
export const askAssistant = async (question: string, history: AssistantTurn[] = [], image?: string): Promise<Answer> =>
  (
    await write<{ answer: Answer }>(
      "/life/assistant",
      "POST",
      { question, history, image },
      (s) => ({ answer: s.ask(question) }),
      idem(),
    )
  ).answer;

/** Sends recorded audio to the API (Sarvam speech-to-text), which answers the transcript in household context. */
export async function askAssistantByVoice(
  audio: Blob,
  history: AssistantTurn[] = [],
): Promise<{ transcript: string; answer: Answer }> {
  const form = new FormData();
  form.append("history", JSON.stringify(history));
  form.append("file", audio, "speech.webm");
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/life/assistant/voice`, { method: "POST", body: form, headers: await authHeaders() });
  } catch {
    throw new Error("Voice service unreachable.");
  }
  if (!res.ok) throw new Error("Could not understand the audio.");
  return (await res.json()) as { transcript: string; answer: Answer };
}

export const getRecipeCatalog = async (servings = 4) =>
  (await read<{ recipes: CatalogRecipeView[] }>(`/life/recipes?servings=${servings}`, (s) => ({ recipes: s.recipes(servings) })))
    .recipes;

export interface PrepareResult {
  ok: boolean;
  recipe: string;
  servings: number;
  consumed: Array<{ name: string; formatted: string }>;
  shortfalls: Array<{ name: string; formatted: string }>;
}

/** Deducts the recipe's ingredients from inventory. Needs the API: there is no offline equivalent. */
export async function prepareRecipe(
  id: string,
  opts: { servings: number; allowPartial: boolean; idempotencyKey: string },
): Promise<PrepareResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/life/recipes/${encodeURIComponent(id)}/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(await authHeaders()) },
      body: JSON.stringify(opts),
    });
  } catch {
    throw new Error("The kitchen service is unreachable, so inventory was not changed.");
  }
  const body = (await res.json().catch(() => ({}))) as Partial<PrepareResult> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Could not prepare this recipe.");
  return body as PrepareResult;
}

export interface RecentReceipt {
  id: string;
  vendor: string;
  date: string;
  items: Array<{ name: string; quantity: number; unit: string }>;
}

export const getRecentReceipts = async () =>
  (await read<{ receipts: RecentReceipt[] }>("/life/receipts/recent", () => ({ receipts: [] }))).receipts;

// ── Notifications ──────────────────────────────────────────────────────────

export const getNotifications = () => read<Notifications>("/notifications", (s) => s.notifications());

export const markNotificationsRead = (ids: string[] | "all") =>
  write("/notifications/read", "POST", { ids }, (s) => {
    s.markRead(ids);
    return { ok: true };
  });

// ── Mobility ───────────────────────────────────────────────────────────────

export const getMobility = () => read<Mobility>("/mobility", (s) => s.mobility());

export const getLeaveBy = (arrival: string, mode: TransportMode) =>
  read<LeaveBy>(`/mobility/leave-by?arrival=${encodeURIComponent(arrival)}&mode=${mode}`, (s) => s.leaveBy(arrival, mode));

export const getChargePlan = (target: number) =>
  read<ChargePlan>(`/mobility/charge-plan?target=${target}`, (s) => s.chargePlan(target));

export const setTripShare = (contactId: string, enabled: boolean) =>
  write(`/mobility/sharing/${encodeURIComponent(contactId)}`, "PUT", { enabled }, (s) => {
    s.setTripSharing(contactId, enabled);
    return { ok: true };
  });

export const setRideRequest = (poolId: string, enabled: boolean) =>
  write(`/mobility/rides/${encodeURIComponent(poolId)}`, "PUT", { enabled }, (s) => {
    s.setRideRequest(poolId, enabled);
    return { ok: true };
  });

// ── Circular ───────────────────────────────────────────────────────────────

export const getCircular = () => read<Circular>("/circular", (s) => s.circular());

export const getOccasionPlan = (picked: { Ethnic: string | null; Accessory: string | null }) =>
  read<OccasionPlan>(
    `/circular/occasion-plan?ethnic=${encodeURIComponent(picked.Ethnic ?? "")}&accessory=${encodeURIComponent(picked.Accessory ?? "")}`,
    (s) => s.occasionPlan(picked),
  );

export const addWardrobeItem = (input: { name: string; category: WardrobeCategory; occasion: string }) =>
  write("/circular/wardrobe", "POST", input, (s) => ({ item: s.addWardrobe(input) }), idem());

export const addListing = (input: { title: string; type: ListingType; perDay: number }) =>
  write("/circular/listings", "POST", input, (s) => ({ item: s.addListing(input) }), idem());

export const setImpactFactors = (factors: { garment: number; household: number }) =>
  write("/circular/impact-factors", "PUT", factors, (s) => {
    s.setFactors(factors);
    return { factors: s.state.factors, co2Saved: s.circular().co2Saved };
  });

// ── Household scopes, plans, kitchen sample data ───────────────────────────

export const getScopes = async () =>
  (await read<{ scopes: Record<ModuleId, boolean> }>("/household/scopes", (s) => ({ scopes: s.scopes() }))).scopes;

export const setScope = async (module: ModuleId, enabled: boolean) =>
  (
    await write<{ scopes: Record<ModuleId, boolean> }>(`/household/scopes/${module}`, "PUT", { enabled }, (s) => {
      s.setScope(module, enabled);
      return { scopes: s.scopes() };
    })
  ).scopes;

export const getPlans = () => read<Plans>("/plans", (s) => s.plans());

export interface CartView {
  items: CartItem[];
  totals: { count: number; total: number; unpriced: number };
}

export const getCart = async (): Promise<CartItem[]> => (await getCartView()).items;

export async function getCartView(): Promise<CartView> {
  const remote = await request<CartView>("/cart");
  if (remote) return remote;
  const items = seed.smartCart as CartItem[];
  return { items, totals: { count: items.length, total: items.reduce((s, c) => s + c.estimatedPrice, 0), unpriced: 0 } };
}

/** Cart changes need the API: there is no offline copy of the cart to edit. */
async function cartWrite<T>(path: string, init: RequestInit): Promise<T> {
  const out = await request<T>(path, init);
  if (out === undefined) throw new Error("The cart service is unreachable.");
  return out;
}

export const addCartItem = (input: { name: string; quantity?: number; unit?: string }) =>
  cartWrite<{ item: CartItem | null; previousQuantity: number }>("/cart/items", {
    method: "POST",
    body: JSON.stringify(input),
    headers: idem(),
  });

export const setCartItemQuantity = (id: string, quantity: number) =>
  cartWrite<{ item: CartItem | null; previousQuantity: number }>(`/cart/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });

export const removeCartItem = (id: string) =>
  cartWrite<{ ok: true }>(`/cart/items/${encodeURIComponent(id)}`, { method: "DELETE" });

export const getBudget = async () =>
  (await request<{ budget: typeof seed.budgetData }>("/budget"))?.budget ?? seed.budgetData;

export const getMealPlan = async () =>
  (await request<{ days: typeof seed.weeklyMealPlan }>("/meal-plan"))?.days ?? seed.weeklyMealPlan;

export const getMembers = async () => {
  const remote = await request<{ members: Array<{ id: string; name: string; role?: string }> }>("/members");
  if (remote && Array.isArray(remote.members) && remote.members.length > 0) {
    return remote.members.map((m) => ({
      id: m.id,
      name: m.name,
      role: (String(m.role ?? "member").toLowerCase().includes("admin") || String(m.role).toLowerCase() === "owner" ? "admin" : "member") as "admin" | "member",
      lastActive: undefined as string | undefined,
    }));
  }
  return seed.familyMembers;
};

// ── Stores & phone ordering ─────────────────────────────────────────────────

/** Like `request`, but a missing server is an error the screen can show. */
async function requireApi<T>(path: string, init?: RequestInit): Promise<T> {
  const out = await request<T>(path, init);
  if (out === undefined) throw new Error("Can't reach the server right now.");
  return out;
}

export const getVendors = async () => (await requireApi<{ vendors: Vendor[] }>("/vendors")).vendors;

export const addVendor = async (input: StoreInput) =>
  (await requireApi<{ vendor: Vendor }>("/vendors", { method: "POST", body: JSON.stringify(input) })).vendor;

export const updateVendor = async (id: string, patch: StoreUpdate) =>
  (await requireApi<{ vendor: Vendor }>(`/vendors/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }))
    .vendor;

export const removeVendor = (id: string) =>
  requireApi<{ ok: true }>(`/vendors/${encodeURIComponent(id)}`, { method: "DELETE" });

export const getOrdering = () => requireApi<OrderingSetup>("/ordering");

export const setOrderingPhone = (phone: string) =>
  requireApi<{ ownerPhone: string }>("/ordering/phone", { method: "PUT", body: JSON.stringify({ phone }) });

/** Orders in plain words; the server calls each store straight away. */
export const placeOrder = (input: OrderRequest) =>
  requireApi<{ actions: Array<{ id: string; title: string; quantity: string; vendor: string; status: string }>; unassigned: string[] }>(
    "/orders",
    { method: "POST", body: JSON.stringify(input) },
  );
