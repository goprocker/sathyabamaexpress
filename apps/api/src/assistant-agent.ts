// Ask: a tool-calling agent over the whole app. Every tool is one of the app's
// own API routes, called in-process with the caller's session (app.inject), so
// the agent sees and changes exactly what the screens do, through the same
// validation, per-user stores and permission checks. Deterministic engines do
// the maths; the model only decides which features to use and phrases the answer.
// Store calls stay one tap away: the agent prepares orders and the chat shows
// "Call store" buttons.
import type { FastifyInstance } from "fastify";
import type { AssistantAction } from "@household/contracts";
import { chatWithTools, type ChatToolMessage, type ChatToolSpec } from "@household/integrations";

type Json = Record<string, unknown>;
type Call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown) => Promise<unknown>;

interface ToolContext {
  call: Call;
  /** Cart changes go through the life routes' own logic so the chat can offer undo. */
  applyCart: (requested: Array<{ type: "cart_add" | "cart_remove"; name: string; quantity: number; unit: string }>) => AssistantAction[];
  image?: string;
}

interface Tool {
  name: string;
  description: string;
  params?: Record<string, unknown>;
  required?: string[];
  /** Screen the tool's data lives on, shown as a source chip. */
  source: { label: string; href: string };
  run: (args: Json, ctx: ToolContext) => Promise<unknown>;
  /** Trims a large route response to what the model needs (fewer tokens, fewer misreadings). */
  shape?: (result: Json) => unknown;
}

const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);

/** Orders as one line each, for the model. */
const orderLines = (list: Json[]) =>
  list.map((a) => ({
    id: a.id,
    store: str(a.vendor) || str((a.targetVendor as Json | undefined)?.name),
    items: str(a.quantity) || arr(a.items).map((i) => `${str(i.orderDisplay)} ${str(i.name)}`).join(", "),
    estimatedCost: str(a.estimatedCost) || (typeof a.estimatedTotalCostInr === "number" ? `₹${a.estimatedTotalCostInr}` : ""),
    status: str(a.frontendStatus) || str(a.status),
    outcome: str((a.execution as Json | undefined)?.detail) || undefined,
  }));

const shapeMeal = (r: Json) => {
  const sim = (r.simulation ?? {}) as Json;
  const orders = arr(r.proposedActions);
  // What is actually short after this plan (re-planning replaces the earlier plan), from the prepared orders.
  // Item lines are the real order (the ripple explanations describe the simulation, before re-planning).
  const ordered = orders.flatMap((a) =>
    arr(a.items).map(
      (i) => `${str(i.name)}: short ${str(i.deficitDisplay)}, ordering ${str(i.orderDisplay)} from ${str((a.targetVendor as Json | undefined)?.name)}`,
    ),
  );
  const orderedIds = new Set(orders.flatMap((a) => arr(a.items).map((i) => i.resourceId)));
  const shortNames = arr(sim.shortages).map((x) => x.resourceId);
  return {
    planned: `${str((sim.recipe as Json | undefined)?.name) || str(sim.recipeName)} for ${String(sim.servings ?? "")}`,
    mealSlot: sim.mealSlot,
    plannedDate: sim.plannedDate,
    readyToCook: orders.length === 0 && shortNames.length === 0,
    shortAndOrdered: ordered,
    shortButNotOrderedHere: arr(sim.shortages)
      .filter((x) => !orderedIds.has(x.resourceId))
      .map((x) => `${str(x.name)} (already on another order, or no store sells it: check get_shortage_orders)`),
    note: orders.length ? "Orders wait for the user's tap on Call store." : "No new orders were needed.",
  };
};

const shapeInventory = (r: Json) => ({
  summary: r.summary,
  items: arr(r.items).map((x) => ({
    name: x.canonicalName,
    status: x.status,
    onHand: x.formattedOnHand,
    reservedForMeals: x.reservedQuantity ? x.formattedReserved : undefined,
    incoming: x.incomingQuantity ? x.formattedIncoming : undefined,
    short: x.deficitQuantity ? x.formattedDeficit : undefined,
    expires: typeof x.nearestExpiryAt === "string" ? x.nearestExpiryAt.slice(0, 10) : undefined,
  })),
});

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
};

const S = {
  home: { label: "Home", href: "/" },
  inventory: { label: "Inventory", href: "/inventory" },
  kitchen: { label: "Kitchen", href: "/kitchen" },
  meals: { label: "Meal plan", href: "/meals" },
  ripple: { label: "Ripple", href: "/ripple" },
  recipes: { label: "Recipes", href: "/recipes" },
  cart: { label: "Smart cart", href: "/cart" },
  actions: { label: "Actions", href: "/actions" },
  stores: { label: "Stores", href: "/stores" },
  notifications: { label: "Notifications", href: "/notifications" },
  admin: { label: "Life Administration", href: "/obligations" },
  timeline: { label: "Timeline", href: "/timeline" },
  mobility: { label: "Smart Mobility", href: "/mobility" },
  circular: { label: "Circular Living", href: "/circular" },
  setup: { label: "Setup", href: "/onboarding" },
  activity: { label: "Activity", href: "/activity" },
};

const TOOLS: Tool[] = [
  // ── Overview & search ────────────────────────────────────────────────────
  { name: "get_overview", description: "Today's household overview: timeline events, suggestions and priorities across all modules.", source: S.home, run: (_a, c) => c.call("GET", "/api/life/overview") },
  { name: "get_summary", description: "Weekly summary: spend, savings, what's coming up.", source: S.home, run: (_a, c) => c.call("GET", "/api/life/summary") },
  { name: "search", description: "Search everything in the app (items, bills, events, people, places).", params: { query: { type: "string" } }, required: ["query"], source: S.home, run: (a, c) => c.call("GET", `/api/life/search${q({ q: str(a.query) })}`) },
  { name: "get_timeline", description: "Calendar of upcoming events, bills and plans with conflicts.", source: S.timeline, run: (_a, c) => c.call("GET", "/api/timeline") },
  { name: "get_activity", description: "Recent activity log: what changed and why.", source: S.activity, run: (_a, c) => c.call("GET", "/api/activity") },

  // ── Kitchen ─────────────────────────────────────────────────────────────
  { name: "get_inventory", description: "Pantry stock with quantities, reserved, incoming, expiry and status (LOW, MISSING, EXPIRING...). filter: all | low | expiring | attention | reserved.", params: { filter: { type: "string", enum: ["all", "low", "expiring", "attention", "reserved"] } }, source: S.inventory, run: (a, c) => c.call("GET", `/api/inventory${q({ filter: str(a.filter) === "all" ? "" : str(a.filter) })}`), shape: shapeInventory },
  { name: "get_forecasts", description: "Shortage and expiry forecasts.", source: S.kitchen, run: (_a, c) => c.call("GET", "/api/forecasts") },
  { name: "get_recipes", description: "Recipe catalogue with what can be cooked from current stock.", params: { servings: { type: "number" } }, source: S.recipes, run: (a, c) => c.call("GET", `/api/life/recipes${q({ servings: num(a.servings, 4) })}`) },
  { name: "get_meal_plan", description: "This week's meal plan.", source: S.meals, run: (_a, c) => c.call("GET", "/api/meal-plan") },
  {
    name: "plan_meal",
    description: "Plan a meal: reserves ingredients, runs the ripple engine, and prepares store orders for anything short. Use the dish name the user said.",
    params: { dish: { type: "string" }, servings: { type: "number" }, mealSlot: { type: "string", enum: ["breakfast", "lunch", "dinner"] }, plannedDate: { type: "string", description: "YYYY-MM-DD, optional" } },
    required: ["dish"],
    source: S.ripple,
    run: (a, c) => c.call("POST", "/api/meals/commit", { dish: str(a.dish), servings: num(a.servings, 4), mealSlot: str(a.mealSlot) || "dinner", ...(str(a.plannedDate) ? { plannedDate: str(a.plannedDate) } : {}), source: "agent", rawTranscript: str(a.dish) }),
    shape: shapeMeal,
  },
  { name: "get_ripple", description: "The ripple graph for the latest meal plan: what it affects and what is short.", source: S.ripple, run: (_a, c) => c.call("GET", "/api/ripple/latest") },
  { name: "cook_recipe", description: "Mark a catalogue recipe as cooked now; deducts its ingredients from stock. Needs a recipe id from get_recipes.", params: { recipeId: { type: "string" }, servings: { type: "number" } }, required: ["recipeId"], source: S.recipes, run: (a, c) => c.call("POST", `/api/life/recipes/${encodeURIComponent(str(a.recipeId))}/prepare`, { servings: num(a.servings, 4) }) },
  { name: "get_cart", description: "The shopping cart.", source: S.cart, run: (_a, c) => c.call("GET", "/api/cart") },
  { name: "get_budget", description: "Grocery budget and spend.", source: S.cart, run: (_a, c) => c.call("GET", "/api/budget") },
  {
    name: "change_cart",
    description: "Add items to or remove items from the shopping cart (not an order; nothing is called).",
    params: { changes: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: ["cart_add", "cart_remove"] }, name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string", enum: ["pc", "pack", "loaf", "kg", "g", "L", "ml", "dozen"] } }, required: ["type", "name"] } } },
    required: ["changes"],
    source: S.cart,
    run: async (a, c) => {
      const changes = Array.isArray(a.changes) ? (a.changes as Json[]) : [];
      return c.applyCart(
        changes.slice(0, 10).map((x) => ({
          type: x.type === "cart_remove" ? "cart_remove" : "cart_add",
          name: str(x.name).slice(0, 80),
          quantity: num(x.quantity, 1),
          unit: str(x.unit) || "pc",
        })),
      );
    },
  },
  { name: "get_recent_purchases", description: "Recent bills/receipts added to inventory.", source: S.inventory, run: (_a, c) => c.call("GET", "/api/life/receipts/recent") },
  {
    name: "scan_attached_receipt",
    description: "Read the grocery bill/receipt photo the user attached. Returns the lines found and a receiptId. Only when an image is attached.",
    source: S.inventory,
    run: async (_a, c) => (c.image ? c.call("POST", "/api/receipts/extract", { imageBase64: c.image }) : { error: "No image is attached." }),
  },
  { name: "add_receipt_to_inventory", description: "Add a scanned receipt's items to inventory (after scan_attached_receipt, when the user wants it added).", params: { receiptId: { type: "string" } }, required: ["receiptId"], source: S.inventory, run: (a, c) => c.call("POST", `/api/receipts/${encodeURIComponent(str(a.receiptId))}/confirm`, {}) },

  // ── Ordering from stores ────────────────────────────────────────────────
  { name: "get_stores", description: "The household's stores/vendors with phone numbers and what they sell.", source: S.stores, run: (_a, c) => c.call("GET", "/api/vendors") },
  { name: "add_store", description: "Add a store the agent can call. categories: produce, dairy, protein, grain, spice, pantry.", params: { name: { type: "string" }, phone: { type: "string" }, categories: { type: "array", items: { type: "string", enum: ["produce", "dairy", "protein", "grain", "spice", "pantry"] } } }, required: ["name", "phone", "categories"], source: S.stores, run: (a, c) => c.call("POST", "/api/vendors", { name: str(a.name), phone: str(a.phone), categories: a.categories, isPreferred: false }) },
  { name: "get_shortage_orders", description: "Store orders covering what's short for planned meals (and restocks), with status, plus short items no store sells.", source: S.ripple, run: (_a, c) => c.call("GET", "/api/shortage-orders"), shape: (r) => ({ orders: orderLines(arr(r.orders)), shortItems: r.short, noStoreSells: r.missingStore, storeCount: r.storeCount }) },
  { name: "prepare_store_order", description: "Prepare orders for specific items the user wants bought (e.g. '2 kg rice; 1 litre milk'), one per store. Does NOT call: the user taps Call store.", params: { items: { type: "string", description: "'quantity unit item' separated by semicolons" }, store: { type: "string" } }, required: ["items"], source: S.stores, run: (a, c) => c.call("POST", "/api/orders", { items: str(a.items), ...(str(a.store) ? { store: str(a.store) } : {}), prepareOnly: true }), shape: (r) => ({ ordersPrepared: orderLines(arr(r.actions)), noStoreSells: r.unassigned, note: "Each waits for the user's tap on Call store." }) },
  { name: "check_restock", description: "Re-check stock now and prepare restock orders for low, out-of-stock and expiring items.", source: S.actions, run: (_a, c) => c.call("POST", "/api/reorders/scan") },
  { name: "get_orders_and_approvals", description: "All proposed and past orders/actions with call status and outcomes.", source: S.actions, run: (_a, c) => c.call("GET", "/api/actions"), shape: (r) => ({ orders: orderLines(arr(r.actions)) }) },
  { name: "reject_order", description: "Cancel/reject an order that is waiting for approval.", params: { actionId: { type: "string" } }, required: ["actionId"], source: S.actions, run: (a, c) => c.call("POST", `/api/actions/${encodeURIComponent(str(a.actionId))}/reject`, {}) },
  { name: "get_phone_ordering", description: "Phone ordering setup: the number to call and the registered phone.", source: S.stores, run: (_a, c) => c.call("GET", "/api/ordering") },

  // ── Notifications ───────────────────────────────────────────────────────
  { name: "get_notifications", description: "Notification centre: low/expiring stock, orders, purchases, bills.", source: S.notifications, run: (_a, c) => c.call("GET", "/api/notifications") },
  { name: "mark_notifications_read", description: "Mark notifications read (ids, or all).", params: { ids: { type: "array", items: { type: "string" } }, all: { type: "boolean" } }, source: S.notifications, run: (a, c) => c.call("POST", "/api/notifications/read", { ids: a.all === true ? "all" : Array.isArray(a.ids) ? a.ids : [] }) },

  // ── Life administration ─────────────────────────────────────────────────
  { name: "get_bills_and_obligations", description: "Bills, renewals, documents and appointments with due dates and amounts.", source: S.admin, run: (_a, c) => c.call("GET", "/api/obligations") },
  { name: "add_bill_or_reminder", description: "Track a bill, renewal, appointment or document from a plain sentence (e.g. 'EB bill ₹2140 due Oct 5').", params: { text: { type: "string" } }, required: ["text"], source: S.admin, run: (a, c) => c.call("POST", "/api/obligations/ingest", { rawText: str(a.text), source: "manual" }), shape: (r) => ({ saved: r.obligation }) },
  { name: "get_profile", description: "Household setup: family members, documents, vehicles, bills, subscriptions, vendors and setup progress.", source: S.setup, run: (_a, c) => c.call("GET", "/api/profile") },

  // ── Mobility ────────────────────────────────────────────────────────────
  { name: "get_mobility", description: "Commute, routes, EV battery and range, trip sharing, ride pools.", source: S.mobility, run: (_a, c) => c.call("GET", "/api/mobility") },
  { name: "get_leave_by", description: "When to leave to arrive on time. arrival HH:MM, mode metro|ev|bus|cab.", params: { arrival: { type: "string" }, mode: { type: "string", enum: ["metro", "ev", "bus", "cab"] } }, required: ["arrival", "mode"], source: S.mobility, run: (a, c) => c.call("GET", `/api/mobility/leave-by${q({ arrival: str(a.arrival), mode: str(a.mode) })}`) },
  { name: "get_charge_plan", description: "EV charging plan to reach a target battery percent.", params: { target: { type: "number" } }, required: ["target"], source: S.mobility, run: (a, c) => c.call("GET", `/api/mobility/charge-plan${q({ target: num(a.target, 80) })}`) },
  { name: "set_trip_sharing", description: "Turn live trip sharing with a contact on or off (contact ids from get_mobility).", params: { contactId: { type: "string" }, enabled: { type: "boolean" } }, required: ["contactId", "enabled"], source: S.mobility, run: (a, c) => c.call("PUT", `/api/mobility/sharing/${encodeURIComponent(str(a.contactId))}`, { enabled: a.enabled === true }) },
  { name: "set_ride_request", description: "Request or cancel a seat in a ride pool (pool ids from get_mobility).", params: { poolId: { type: "string" }, enabled: { type: "boolean" } }, required: ["poolId", "enabled"], source: S.mobility, run: (a, c) => c.call("PUT", `/api/mobility/rides/${encodeURIComponent(str(a.poolId))}`, { enabled: a.enabled === true }) },

  // ── Circular living ─────────────────────────────────────────────────────
  { name: "get_circular", description: "Wardrobe, listings (rent/lend/exchange) and impact.", source: S.circular, run: (_a, c) => c.call("GET", "/api/circular") },
  { name: "add_wardrobe_item", description: "Add clothing to the wardrobe.", params: { name: { type: "string" }, category: { type: "string", enum: ["Ethnic", "Formal", "Casual", "Accessory"] }, occasion: { type: "string" } }, required: ["name", "category", "occasion"], source: S.circular, run: (a, c) => c.call("POST", "/api/circular/wardrobe", { name: str(a.name), category: str(a.category), occasion: str(a.occasion) }) },
  { name: "add_listing", description: "List an item to rent, lend or exchange.", params: { title: { type: "string" }, type: { type: "string", enum: ["rent", "lend", "exchange"] }, perDay: { type: "number" } }, required: ["title", "type"], source: S.circular, run: (a, c) => c.call("POST", "/api/circular/listings", { title: str(a.title), type: str(a.type), perDay: num(a.perDay, 0) }) },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
const TOOL_SPECS: ChatToolSpec[] = TOOLS.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: { type: "object", properties: t.params ?? {}, required: t.required ?? [], additionalProperties: false },
  },
}));

const SYSTEM_PROMPT = `You are Livora, the household's assistant inside the LIVORA app. You can use every part of the app through tools: kitchen inventory, meal planning and the ripple engine, recipes, cart, stores and ordering, notifications, bills and reminders, mobility, circular living, timeline and household setup.
Rules:
- Facts come from tools or the snapshot, never from memory. When the question needs current data, call the tool (several in parallel if useful). Do not guess numbers, prices, dates or names.
- When the user asks you to do something, do it with the matching tool, then confirm what changed in one sentence.
- Buying from a store: plan_meal and check_restock prepare orders automatically; for items the user names, use prepare_store_order. You never place the call yourself: a "Call store" button appears under your answer and one tap makes the agent phone the store, which delivers home. End with "Tap Call store to order." when orders were prepared. Never ask "shall I proceed" and never claim a call was made.
- Report only what the tool results say: an item is short only if a tool result lists it as short or ordered. Don't list items that are fine.
- Commute or "when should I leave" questions: always call get_leave_by with the user's arrival time and mode (default metro) — the snapshot's times are for a different trip.
- If no store sells something, say which items and suggest adding a store (add_store needs a name, phone and categories).
- Reply in the user's language (English, Tamil or Tanglish). Format: one or two plain sentences, then up to 6 lines starting with "- ", each complete on its own (e.g. "- Chicken: 700 g left, 800 g short"). No headings, no nested lists, no markdown bold. Rupees as ₹.`;

const MAX_STEPS = 6;
const MAX_TOOL_RESULT_CHARS = 7000;

export interface AgentAnswer {
  text: string;
  bullets: string[];
  sources: Array<{ label: string; href: string }>;
  actions: AssistantAction[];
  provider: "openai-agent";
  /** Store orders the answer prepared or refers to, for "Call store" buttons. */
  orders: Array<{ id: string; vendor: string; items: string; estimatedCost: string; status: string }>;
  /** Features the agent used, in order, for the "Used: …" line. */
  steps: string[];
}

function toOrderCards(result: unknown): AgentAnswer["orders"] {
  const list = (result && typeof result === "object" && Array.isArray((result as Json).orders ?? (result as Json).actions)
    ? ((result as Json).orders ?? (result as Json).actions)
    : []) as Json[];
  return list
    .filter((a) => typeof a.id === "string" && (a.type === "VENDOR_PURCHASE_CALL" || a.vendor))
    .map((a) => ({
      id: str(a.id),
      vendor: str(a.vendor) || str((a.targetVendor as Json | undefined)?.name) || "Store",
      items: str(a.quantity),
      estimatedCost: str(a.estimatedCost),
      status: str(a.status),
    }));
}

function splitAnswer(content: string): { text: string; bullets: string[] } {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-•*]\s+/.test(l)).map((l) => l.replace(/^[-•*]\s+/, "").replace(/\*\*/g, ""));
  const text = lines.filter((l) => !/^[-•*]\s+/.test(l)).join(" ").replace(/\*\*/g, "");
  return { text: text || bullets.shift() || "Done.", bullets: bullets.slice(0, 6) };
}

export function createAssistantAgent(app: FastifyInstance) {
  return async function runAgent(input: {
    question: string;
    history?: Array<{ q: string; a: string }>;
    image?: string;
    /** The caller's Authorization header: tools act as this user. */
    authorization?: string;
    idempotencyKey?: string;
    snapshot: unknown;
    applyCart: ToolContext["applyCart"];
  }): Promise<AgentAnswer> {
    let writes = 0;
    const call: Call = async (method, url, body) => {
      const headers: Record<string, string> = {};
      if (input.authorization) headers.authorization = input.authorization;
      if (method !== "GET") {
        writes += 1;
        if (input.idempotencyKey) headers["idempotency-key"] = `${input.idempotencyKey}:${writes}`;
      }
      const res = await app.inject({ method, url, headers, ...(body !== undefined ? { payload: body as Json } : {}) });
      let parsed: unknown;
      try {
        parsed = res.json();
      } catch {
        parsed = { raw: res.body.slice(0, 500) };
      }
      if (res.statusCode >= 400) {
        const err = (parsed as Json | undefined)?.error;
        return { error: typeof err === "string" ? err : `Request failed (${res.statusCode}).`, status: res.statusCode };
      }
      return parsed;
    };
    const ctx: ToolContext = { call, applyCart: input.applyCart, image: input.image };

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const messages: ChatToolMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\nToday is ${today} (India time).` },
      { role: "user", content: `Household snapshot (may be slightly stale; use tools for anything current or to act):\n${JSON.stringify(input.snapshot).slice(0, 12000)}` },
    ];
    for (const turn of (input.history ?? []).slice(-4)) {
      messages.push({ role: "user", content: turn.q }, { role: "assistant", content: turn.a });
    }
    messages.push({
      role: "user",
      content: input.image
        ? [{ type: "text", text: `${input.question}\n(An image is attached; scan_attached_receipt can read a receipt.)` }, { type: "image_url", image_url: { url: input.image } }]
        : input.question,
    });

    const used: Tool[] = [];
    const cartActions: AssistantAction[] = [];
    const orders = new Map<string, AgentAnswer["orders"][number]>();

    for (let step = 0; step < MAX_STEPS; step++) {
      const reply = await chatWithTools({
        messages,
        tools: TOOL_SPECS,
        ...(input.image ? { model: process.env.OPENAI_VISION_MODEL || "gpt-4o" } : {}),
      });
      if (reply.toolCalls.length === 0) {
        const { text, bullets } = splitAnswer(reply.content ?? "");
        const sources = [...new Map(used.map((t) => [t.source.href, t.source])).values()];
        return {
          text,
          bullets,
          sources,
          actions: cartActions,
          provider: "openai-agent",
          orders: [...orders.values()].filter((o) => o.status !== "rejected"),
          steps: [...new Set(used.map((t) => t.source.label))],
        };
      }
      messages.push({ role: "assistant", content: reply.content, tool_calls: reply.toolCalls });
      const results = await Promise.all(
        reply.toolCalls.map(async (tc) => {
          const tool = TOOL_BY_NAME.get(tc.function.name);
          if (!tool) return { tc, result: { error: `Unknown tool ${tc.function.name}` } };
          let args: Json = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}") as Json;
          } catch {
            return { tc, result: { error: "Arguments were not valid JSON." } };
          }
          used.push(tool);
          try {
            return { tc, tool, result: await tool.run(args, ctx) };
          } catch (err) {
            return { tc, tool, result: { error: err instanceof Error ? err.message : "Tool failed." } };
          }
        }),
      );
      for (const { tc, tool, result } of results) {
        if (tool?.name === "change_cart" && Array.isArray(result)) cartActions.push(...(result as AssistantAction[]));
        if (tool && ["prepare_store_order", "get_shortage_orders", "plan_meal", "check_restock"].includes(tool.name)) {
          // plan_meal/check_restock prepare orders; show the current ones to call.
          const cards = tool.name === "plan_meal" || tool.name === "check_restock"
            ? toOrderCards(await call("GET", "/api/shortage-orders"))
            : toOrderCards(result);
          for (const card of cards) if (card.status === "proposed" || card.status === "PENDING_APPROVAL") orders.set(card.id, card);
        }
        const forModel =
          tool?.shape && result && typeof result === "object" && !Array.isArray(result) && !("error" in (result as Json))
            ? tool.shape(result as Json)
            : result;
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(forModel ?? null).slice(0, MAX_TOOL_RESULT_CHARS) });
      }
    }
    return {
      text: "That took more steps than I can do at once. Try asking one thing at a time.",
      bullets: [],
      sources: [],
      actions: cartActions,
      provider: "openai-agent",
      orders: [...orders.values()],
      steps: [...new Set(used.map((t) => t.source.label))],
    };
  };
}

export type AssistantAgent = ReturnType<typeof createAssistantAgent>;
