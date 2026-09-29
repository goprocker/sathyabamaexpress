// Deterministic demo state that mirrors the TRD §9 data model.
// The real backend (apps/api + PostgreSQL) will serve identical shapes via
// packages/contracts; apps/web/src/lib/api is the single swap point.

import type {
  ActionItem,
  ActivityEntry,
  AgentStep,
  DashboardData,
  Forecast,
  InventoryItem,
  InventoryLot,
  MealPlan,
  Obligation,
  ObligationsSummary,
  Recipe,
  RippleEdge,
  RippleGraph,
  RippleNode,
} from "./types";

// ── Inventory ──────────────────────────────────────────────────────────────

export const inventoryLots: InventoryLot[] = [
  {
    id: "lot_rice_1",
    itemId: "ing_rice",
    quantity: 5,
    unit: "kg",
    purchasedAt: "2026-09-24",
    expiresAt: "2027-03-01",
    source: "receipt_rcp_001",
  },
  {
    id: "lot_chicken_1",
    itemId: "ing_chicken",
    quantity: 0.7,
    unit: "kg",
    purchasedAt: "2026-09-25",
    expiresAt: "2026-09-29",
    source: "receipt_rcp_001",
  },
  {
    id: "lot_onion_1",
    itemId: "ing_onion",
    quantity: 1.8,
    unit: "kg",
    purchasedAt: "2026-09-24",
    expiresAt: "2026-10-08",
    source: "receipt_rcp_001",
  },
  {
    id: "lot_milk_1",
    itemId: "ing_milk",
    quantity: 0.4,
    unit: "L",
    purchasedAt: "2026-09-26",
    expiresAt: "2026-09-30",
    source: "receipt_rcp_002",
  },
  {
    id: "lot_dal_1",
    itemId: "ing_dal",
    quantity: 0.85,
    unit: "kg",
    purchasedAt: "2026-09-20",
    expiresAt: "2027-02-01",
    source: "receipt_rcp_002",
  },
];

export const inventory: InventoryItem[] = [
  {
    id: "ing_rice",
    name: "Rice",
    category: "Grains",
    quantity: 5,
    unit: "kg",
    lowThreshold: 1,
    expiry: "2027-03-01",
    dailyConsumption: 0.3,
    history: [
      { date: "2026-09-24", delta: 5, label: "Receipt · FreshMart" },
      { date: "2026-09-27", delta: -0.6, label: "Dosa · 4 servings" },
    ],
    lots: [inventoryLots[0]!],
  },
  {
    id: "ing_chicken",
    name: "Chicken",
    category: "Meat",
    quantity: 0.7,
    unit: "kg",
    lowThreshold: 0.5,
    expiry: "2026-09-29",
    dailyConsumption: 0.25,
    history: [
      { date: "2026-09-25", delta: 1.5, label: "Receipt · FreshMart" },
      { date: "2026-09-27", delta: -0.8, label: "Curry · 3 servings" },
    ],
    lots: [inventoryLots[1]!],
  },
  {
    id: "ing_onion",
    name: "Onion",
    category: "Vegetables",
    quantity: 1.8,
    unit: "kg",
    lowThreshold: 0.5,
    expiry: "2026-10-08",
    dailyConsumption: 0.2,
    history: [{ date: "2026-09-24", delta: 2, label: "Receipt · FreshMart" }],
    lots: [inventoryLots[2]!],
  },
  {
    id: "ing_milk",
    name: "Milk",
    category: "Dairy",
    quantity: 0.4,
    unit: "L",
    lowThreshold: 0.5,
    expiry: "2026-09-30",
    dailyConsumption: 0.15,
    history: [{ date: "2026-09-26", delta: 1, label: "Receipt · DailyMart" }],
    lots: [inventoryLots[3]!],
  },
  {
    id: "ing_dal",
    name: "Dal",
    category: "Grains",
    quantity: 0.85,
    unit: "kg",
    lowThreshold: 0.3,
    expiry: "2027-02-01",
    dailyConsumption: 0.1,
    history: [{ date: "2026-09-20", delta: 1, label: "Receipt · DailyMart" }],
    lots: [inventoryLots[4]!],
  },
];

// ── Recipes & meals ────────────────────────────────────────────────────────

export const recipes: Recipe[] = [
  {
    id: "rcp_biryani",
    name: "Biryani",
    cuisine: "South Indian",
    servings: 1,
    ingredients: [
      { itemId: "ing_rice", name: "Rice", quantityPerServing: 0.2, unit: "kg" },
      {
        itemId: "ing_chicken",
        name: "Chicken",
        quantityPerServing: 0.25,
        unit: "kg",
      },
      {
        itemId: "ing_onion",
        name: "Onion",
        quantityPerServing: 0.15,
        unit: "kg",
      },
    ],
  },
  {
    id: "rcp_dosa",
    name: "Dosa",
    cuisine: "South Indian",
    servings: 1,
    ingredients: [
      { itemId: "ing_rice", name: "Rice", quantityPerServing: 0.15, unit: "kg" },
      { itemId: "ing_dal", name: "Dal", quantityPerServing: 0.05, unit: "kg" },
    ],
  },
  {
    id: "rcp_curry",
    name: "Chicken Curry",
    cuisine: "South Indian",
    servings: 1,
    ingredients: [
      {
        itemId: "ing_chicken",
        name: "Chicken",
        quantityPerServing: 0.25,
        unit: "kg",
      },
      {
        itemId: "ing_onion",
        name: "Onion",
        quantityPerServing: 0.1,
        unit: "kg",
      },
    ],
  },
];

export const mealPlan: MealPlan[] = [
  {
    id: "meal_001",
    recipeId: "rcp_biryani",
    recipeName: "Biryani",
    servings: 6,
    date: "2026-09-30",
    slot: "Dinner",
    status: "planned",
  },
];

// ── Ripple graph for MEAL_PLANNED (deterministic, mirrors TRD §16) ────────

export function buildBiryaniRipple(): RippleGraph {
  const nodes: RippleNode[] = [
    { id: "meal", label: "Biryani · 6 servings", state: "planned", depth: 0 },
    { id: "rice", label: "Rice", state: "available", depth: 1 },
    {
      id: "chicken",
      label: "Chicken · 700 g",
      state: "short",
      depth: 1,
      detail: "Required 1.5 kg · Available 700 g",
    },
    { id: "onion", label: "Onion", state: "available", depth: 1 },
    {
      id: "deficit",
      label: "800 g short",
      state: "short",
      depth: 2,
      detail: "After meal + forecast depletion",
    },
    {
      id: "forecast",
      label: "Rest of week at risk",
      state: "warning",
      depth: 3,
      detail: "Curry planned Thursday needs 750 g",
    },
    {
      id: "action",
      label: "Purchase chicken · 800 g",
      state: "proposed",
      depth: 4,
      detail: "FreshMart · approx ₹260",
    },
  ];
  const edges: RippleEdge[] = [
    { from: "meal", to: "rice", label: "consumes 1.2 kg" },
    { from: "meal", to: "chicken", label: "consumes 1.5 kg" },
    { from: "meal", to: "onion", label: "consumes 0.8 kg" },
    { from: "chicken", to: "deficit", label: "shortage" },
    { from: "deficit", to: "forecast", label: "future meal conflict" },
    { from: "forecast", to: "action", label: "action proposed" },
  ];
  return { eventId: "evt_meal_001", title: "Biryani · 6 servings", nodes, edges };
}

export const biryaniWhy = {
  summary: "Tomorrow's biryani needs more chicken than we have.",
  rows: [
    { label: "Required", value: "1.5 kg" },
    { label: "Available", value: "700 g" },
    { label: "Difference", value: "800 g" },
  ],
  sources: ["meal plan · biryani × 6", "confirmed inventory", "recent purchase history"],
};

// ── Actions ────────────────────────────────────────────────────────────────

export const actions: ActionItem[] = [
  {
    id: "act_001",
    kind: "purchase",
    title: "Purchase chicken",
    quantity: "800 g",
    reason:
      "Tomorrow's biryani requires 1.5 kg. Current inventory contains 700 g.",
    evidence: {
      required: "1.5 kg",
      available: "700 g",
      deficit: "800 g",
    },
    vendor: "FreshMart",
    estimatedCost: "₹260",
    status: "proposed",
    createdAt: "2026-09-29T09:52:00+05:30",
    execution: null,
  },
  {
    id: "act_002",
    kind: "renew",
    title: "Renew car insurance",
    quantity: "1 year",
    reason:
      "Policy expires 14 Oct. Renewal premium quoted at ₹18,400 with last year's claim-free discount applied.",
    vendor: "HDFC Ergo",
    estimatedCost: "₹18,400",
    status: "proposed",
    createdAt: "2026-09-29T10:12:00+05:30",
    execution: null,
  },
];

// ── Obligations beyond the kitchen (PRD §1, §14) ──────────────────────────

export const obligations: Obligation[] = [
  {
    id: "obl_car_insurance",
    domain: "vehicle",
    title: "Car insurance renewal",
    provider: "HDFC Ergo",
    detail: "Swift ZXI · TN 09 AB 1234",
    dueDate: "2026-10-14",
    amount: "₹18,400",
    recurrence: "yearly",
    status: "action_proposed",
    linkedActionId: "act_002",
  },
  {
    id: "obl_driving_licence",
    domain: "document",
    title: "Driving licence",
    provider: "Parivahan Sewa",
    detail: "Expires in 15 days · renewal requires a fitness check",
    dueDate: "2026-10-14",
    status: "due_soon",
  },
  {
    id: "obl_aadhaar",
    domain: "document",
    title: "Aadhaar card",
    provider: "UIDAI",
    detail: "No expiry · address verified 2024",
    status: "ok",
  },
  {
    id: "obl_passport",
    domain: "document",
    title: "Passports",
    provider: "Passport Seva",
    detail: "2 passports · valid until 2031",
    status: "ok",
  },
  {
    id: "obl_electricity",
    domain: "bill",
    title: "Electricity bill",
    provider: "TNEB",
    detail: "Usage 18% above last month",
    dueDate: "2026-10-05",
    amount: "₹2,140",
    recurrence: "monthly",
    status: "due_soon",
  },
  {
    id: "obl_broadband",
    domain: "bill",
    title: "Broadband",
    provider: "ACT Fibernet",
    detail: "300 Mbps · auto-pay inactive",
    dueDate: "2026-10-07",
    amount: "₹799",
    recurrence: "monthly",
    status: "due_soon",
  },
  {
    id: "obl_netflix",
    domain: "subscription",
    title: "Netflix",
    provider: "Netflix",
    detail: "Premium · 4 screens",
    amount: "₹649",
    recurrence: "monthly",
    status: "ok",
  },
  {
    id: "obl_gym",
    domain: "subscription",
    title: "Gym membership",
    provider: "Cult Fit",
    detail: "Used 4 times last month · ₹300 per visit",
    amount: "₹1,200",
    recurrence: "monthly",
    status: "ok",
  },
  {
    id: "obl_car_service",
    domain: "vehicle",
    title: "Periodic service",
    provider: "Maruti Authorised Service",
    detail: "10,000 km interval · 9,400 km driven",
    dueDate: "2026-10-20",
    status: "due_soon",
  },
  {
    id: "obl_dentist",
    domain: "appointment",
    title: "Dentist appointment",
    provider: "Apollo Dental",
    detail: "Scaling · 11:00 AM",
    dueDate: "2026-10-03",
    status: "ok",
  },
];

export const obligationsSummary: ObligationsSummary = {
  documents: { total: 3, expiringSoon: 1 },
  vehicle: { dueSoon: 2 },
  subscriptions: { active: 2, monthlyCost: "₹1,849" },
  bills: { dueSoon: 2, amount: "₹2,939" },
  appointments: { upcoming: 1 },
};

// ── Activity ───────────────────────────────────────────────────────────────

export const activity: ActivityEntry[] = [
  {
    id: "act_evt_0b",
    time: "10:12",
    title: "Renewal proposed",
    description: "Car insurance · ₹18,400 · expires Oct 14",
    kind: "obligation",
  },
  {
    id: "act_evt_0a",
    time: "10:05",
    title: "Bill due detected",
    description: "TNEB electricity · ₹2,140 · due Oct 5",
    kind: "obligation",
  },
  {
    id: "act_evt_1",
    time: "09:53",
    title: "Action approved",
    description: "Purchase chicken · 800 g",
    kind: "action",
  },
  {
    id: "act_evt_2",
    time: "09:52",
    title: "Shortage detected",
    description: "Chicken · 800 g",
    kind: "alert",
  },
  {
    id: "act_evt_3",
    time: "09:51",
    title: "Meal planned",
    description: "Biryani · 6 servings",
    kind: "meal",
  },
  {
    id: "act_evt_4",
    time: "09:43",
    title: "Inventory updated",
    description: "Rice +5 kg",
    kind: "inventory",
  },
  {
    id: "act_evt_5",
    time: "09:42",
    title: "Receipt processed",
    description: "4 items detected",
    kind: "receipt",
  },
];

export const agentTrace: AgentStep[] = [
  {
    agent: "Supervisor",
    detail: "Classified request · meal planning intent",
  },
  { agent: "Meal Agent", detail: "Resolved recipe · biryani" },
  { agent: "Inventory Tool", detail: "Checked 42 items" },
  { agent: "Ripple Engine", detail: "Found chicken shortage" },
  { agent: "Forecast", detail: "Predicted depletion in 2 days" },
  { agent: "Action Planner", detail: "Proposed purchase · 800 g" },
];

// ── Forecasts ──────────────────────────────────────────────────────────────

export const forecasts: Forecast[] = [
  {
    id: "fc_1",
    itemId: "ing_chicken",
    itemName: "Chicken",
    type: "SHORTAGE_RISK",
    detail: "Runs out tomorrow · 800 g needed for biryani",
    horizonDays: 2,
    severity: "high",
  },
  {
    id: "fc_2",
    itemId: "ing_milk",
    itemName: "Milk",
    type: "EXPIRY_RISK",
    detail: "Expires in 1 day · 0.4 L unused",
    horizonDays: 1,
    severity: "medium",
  },
  {
    id: "fc_3",
    itemId: "ing_rice",
    itemName: "Rice",
    type: "RECURRING_DEMAND",
    detail: "Typical 10-day cycle · reorder by Oct 6",
    horizonDays: 7,
    severity: "low",
    domain: "kitchen",
  },
  {
    id: "fc_4",
    itemId: "obl_car_insurance",
    itemName: "Car insurance",
    type: "RECURRING_DEMAND",
    detail: "Annual renewal · premium quoted ₹18,400 · pay before Oct 14",
    horizonDays: 15,
    severity: "high",
    domain: "vehicle",
  },
  {
    id: "fc_5",
    itemId: "obl_electricity",
    itemName: "Electricity bill",
    type: "RECURRING_DEMAND",
    detail: "Due Oct 5 · usage trending 18% above average",
    horizonDays: 6,
    severity: "medium",
    domain: "bill",
  },
  {
    id: "fc_6",
    itemId: "obl_driving_licence",
    itemName: "Driving licence",
    type: "EXPIRY_RISK",
    detail: "Expires Oct 14 · renewal slot availability drops closer to date",
    horizonDays: 15,
    severity: "medium",
    domain: "document",
  },
  {
    id: "fc_7",
    itemId: "obl_car_service",
    itemName: "Periodic service",
    type: "RECURRING_DEMAND",
    detail: "10,000 km interval reached in ~3 weeks at current usage",
    horizonDays: 21,
    severity: "low",
    domain: "vehicle",
  },
];

// ── Receipts ───────────────────────────────────────────────────────────────

export const receiptScans = [
  {
    id: "rscan_001",
    vendor: "FreshMart",
    items: [
      { name: "Rice", quantity: 5, unit: "kg", confidence: "high" as const },
      { name: "Chicken", quantity: 1.5, unit: "kg", confidence: "high" as const },
      { name: "Onion", quantity: 2, unit: "kg", confidence: "high" as const },
      { name: "Tomato", quantity: 1, unit: "kg", confidence: "low" as const },
    ],
  },
];

// ── Dashboard ──────────────────────────────────────────────────────────────

export function dashboard(): DashboardData {
  const low = inventory.filter(
    (i) => i.quantity < i.lowThreshold * 2 && i.quantity >= i.lowThreshold,
  );
  const expiringSoon = inventory.filter(
    (i) => i.expiry != null && i.expiry <= "2026-10-01",
  );
  return {
    todayMeal: { recipeName: "Biryani", servings: 6, shortCount: 2 },
    inventorySummary: {
      total: 42,
      low: low.length,
      expiring: expiringSoon.length,
    },
    attentionItems: [
      {
        id: "attn_1",
        title: "Chicken · 800 g short",
        description: "Purchase proposed",
        href: "/actions",
      },
      {
        id: "attn_2",
        title: "Milk expires in 1 day",
        description: "0.4 L unused",
        href: "/inventory/ing_milk",
      },
      {
        id: "attn_3",
        title: "Car insurance expires in 15 days",
        description: "Renewal proposed · ₹18,400",
        href: "/actions",
      },
      {
        id: "attn_4",
        title: "Electricity bill due Oct 5",
        description: "₹2,140 · usage above average",
        href: "/obligations",
      },
    ],
    obligationsSummary,
    recentActivity: activity.slice(0, 4),
  };
}

// ── Voice utterances (demo) ────────────────────────────────────────────────

export const voiceUtterance = {
  transcript: "Naalaikku 6 perukku biryani pannanum.",
  event: {
    type: "MEAL_PLANNED",
    dish: "Biryani",
    servings: 6,
    date: "2026-09-30",
  } as const,
};
