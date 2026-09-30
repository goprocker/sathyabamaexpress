import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type {
  ActionOutcome,
  ActionProposal,
  AgentRunTrace,
  BaseUnit,
  CartItem,
  HouseholdNotification,
  PushSubscriptionInput,
  DisplayUnit,
  ExpectationRecord,
  Forecast,
  Household,
  IngredientStatus,
  InventoryLot,
  MealPlan,
  Member,
  Obligation,
  ReceiptUpload,
  Recipe,
  Resource,
  RippleGraph,
  StateTransition,
  TimelineEntry,
  Vendor,
  HouseholdProfile,
} from "@household/contracts";
import { emptyHouseholdProfile } from "@household/contracts";
import { buildDemoHousehold } from "./demo-household.js";

export interface StoredEvent {
  id: string;
  householdId: string;
  idempotencyKey: string;
  type: string;
  source: string;
  confidence: number;
  payload: Record<string, unknown>;
  transitions?: StateTransition[];
  stateVersion?: number;
  createdAt: string;
}

export interface StoredRelationship {
  id: string;
  householdId: string;
  sourceType: string;
  sourceId: string;
  relation: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRecord {
  id: string;
  householdId: string;
  actor: string;
  operation: string;
  entityType: string;
  entityId: string;
  stateVersion: number;
  transitions: StateTransition[];
  beforeState?: unknown;
  afterState?: unknown;
  createdAt: string;
}

export interface ApprovalTokenRecord {
  actionId: string;
  tokenHash: string;
  payloadHash: string;
  userId: string;
  expiresAt: string;
}

export interface CanonicalStateData {
  stateVersion: number;
  households: Household[];
  members: Member[];
  vendors: Vendor[];
  resources: Resource[];
  lots: InventoryLot[];
  receiptUploads: ReceiptUpload[];
  recipes: Recipe[];
  mealPlans: MealPlan[];
  events: StoredEvent[];
  relationships: StoredRelationship[];
  obligations: Obligation[];
  forecasts: Forecast[];
  actions: ActionProposal[];
  outcomes: ActionOutcome[];
  expectations: ExpectationRecord[];
  rippleGraphs: Record<string, RippleGraph>;
  agentRuns: AgentRunTrace[];
  timeline: TimelineEntry[];
  auditLogs: AuditRecord[];
  approvalTokens: Record<string, ApprovalTokenRecord>;
  idempotencyCache: Record<string, { createdAt: string; result: unknown }>;
  /** The household's shopping cart. Absent in state saved before the cart existed. */
  cart?: CartItem[];
  /** Family, documents, vehicles and bills collected in Setup. Absent on older saved states. */
  profile?: HouseholdProfile;
  /** The shared demo household: sample data everywhere, no uploads, no live calls. */
  isDemo?: boolean;
  /** Inventory and transaction notifications, newest first. Absent in older saved state. */
  notifications?: HouseholdNotification[];
  /** Browsers/phones that asked for push notifications. */
  pushSubscriptions?: Array<PushSubscriptionInput & { createdAt: string }>;
}

export function emptyCanonicalState(): CanonicalStateData {
  return {
    stateVersion: 1,
    households: [],
    members: [],
    vendors: [],
    resources: [],
    lots: [],
    receiptUploads: [],
    recipes: [],
    mealPlans: [],
    events: [],
    relationships: [],
    obligations: [],
    forecasts: [],
    actions: [],
    outcomes: [],
    expectations: [],
    rippleGraphs: {},
    agentRuns: [],
    timeline: [],
    auditLogs: [],
    approvalTokens: {},
    idempotencyCache: {},
  };
}

export function formatQuantityDisplay(
  baseQty: number,
  baseUnit: BaseUnit,
  preferredDisplay?: DisplayUnit
): string {
  const rounded = Math.round(baseQty * 100) / 100;
  if (baseUnit === "g") {
    if (preferredDisplay === "kg" || Math.abs(rounded) >= 1000) {
      const kg = Math.round((rounded / 1000) * 100) / 100;
      return `${kg % 1 === 0 ? kg.toFixed(1) : kg} kg`;
    }
    return `${Math.round(rounded)} g`;
  }
  if (baseUnit === "ml") {
    if (preferredDisplay === "L" || Math.abs(rounded) >= 1000) {
      const liters = Math.round((rounded / 1000) * 100) / 100;
      return `${liters % 1 === 0 ? liters.toFixed(1) : liters} L`;
    }
    return `${Math.round(rounded)} ml`;
  }
  return `${Math.round(rounded)} pcs`;
}

export function computeResourceDerivedFields(
  raw: Omit<
    Resource,
    | "netAvailableQuantity"
    | "deficitQuantity"
    | "status"
    | "formattedOnHand"
    | "formattedReserved"
    | "formattedIncoming"
    | "formattedNetAvailable"
    | "formattedDeficit"
    | "daysUntilDepletion"
  >,
  lots: InventoryLot[]
): Resource {
  const netAvailable =
    raw.onHandQuantity - raw.reservedQuantity + raw.incomingQuantity;
  const deficit = Math.max(0, -netAvailable);

  const activeLots = lots
    .filter(
      (l) =>
        l.resourceId === raw.id &&
        l.status === "ACTIVE" &&
        l.quantityRemaining > 0
    )
    .sort((a, b) => {
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    });

  const nearestExpiryAt =
    activeLots[0]?.expiresAt ?? raw.nearestExpiryAt ?? null;
  const nowMs = Date.now();
  const isExpiringSoon =
    nearestExpiryAt !== null &&
    new Date(nearestExpiryAt).getTime() - nowMs <= 36 * 60 * 60 * 1000;

  let status: IngredientStatus = "AVAILABLE";
  if (deficit > 0) {
    status = "MISSING";
  } else if (isExpiringSoon) {
    status = "EXPIRING";
  } else if (netAvailable <= raw.safetyThreshold) {
    status = "LOW";
  } else if (raw.avgDailyBurn > 0 && netAvailable / raw.avgDailyBurn > 14) {
    status = "SURPLUS";
  }

  const daysUntilDepletion =
    raw.avgDailyBurn > 0
      ? Math.max(
          0,
          Math.round((Math.max(0, netAvailable) / raw.avgDailyBurn) * 10) / 10
        )
      : null;

  return {
    ...raw,
    netAvailableQuantity: netAvailable,
    deficitQuantity: deficit,
    status,
    formattedOnHand: formatQuantityDisplay(
      raw.onHandQuantity,
      raw.baseUnit,
      raw.displayUnit
    ),
    formattedReserved: formatQuantityDisplay(
      raw.reservedQuantity,
      raw.baseUnit,
      raw.displayUnit
    ),
    formattedIncoming: formatQuantityDisplay(
      raw.incomingQuantity,
      raw.baseUnit,
      raw.displayUnit
    ),
    formattedNetAvailable: formatQuantityDisplay(
      Math.max(0, netAvailable),
      raw.baseUnit,
      raw.displayUnit
    ),
    formattedDeficit: formatQuantityDisplay(
      deficit,
      raw.baseUnit,
      raw.displayUnit
    ),
    nearestExpiryAt,
    daysUntilDepletion,
  };
}

export function computeStateTransitions(
  before: CanonicalStateData,
  after: CanonicalStateData
): StateTransition[] {
  const transitions: StateTransition[] = [];

  for (const afterRes of after.resources) {
    const beforeRes = before.resources.find((r) => r.id === afterRes.id);
    if (!beforeRes) continue;

    if (beforeRes.onHandQuantity !== afterRes.onHandQuantity) {
      const diff = afterRes.onHandQuantity - beforeRes.onHandQuantity;
      transitions.push({
        entityType: "resource",
        entityId: afterRes.id,
        entityLabel: afterRes.canonicalName,
        field: "onHandQuantity",
        before: beforeRes.formattedOnHand,
        after: afterRes.formattedOnHand,
        deltaDisplay: `${diff >= 0 ? "+" : "-"}${formatQuantityDisplay(
          Math.abs(diff),
          afterRes.baseUnit,
          afterRes.displayUnit
        )}`,
      });
    }

    if (beforeRes.reservedQuantity !== afterRes.reservedQuantity) {
      const diff = afterRes.reservedQuantity - beforeRes.reservedQuantity;
      transitions.push({
        entityType: "resource",
        entityId: afterRes.id,
        entityLabel: afterRes.canonicalName,
        field: "reservedQuantity",
        before: beforeRes.formattedReserved,
        after: afterRes.formattedReserved,
        deltaDisplay: `${diff >= 0 ? "+" : "-"}${formatQuantityDisplay(
          Math.abs(diff),
          afterRes.baseUnit,
          afterRes.displayUnit
        )}`,
      });
    }

    if (beforeRes.incomingQuantity !== afterRes.incomingQuantity) {
      const diff = afterRes.incomingQuantity - beforeRes.incomingQuantity;
      transitions.push({
        entityType: "resource",
        entityId: afterRes.id,
        entityLabel: afterRes.canonicalName,
        field: "incomingQuantity",
        before: beforeRes.formattedIncoming,
        after: afterRes.formattedIncoming,
        deltaDisplay: `${diff >= 0 ? "+" : "-"}${formatQuantityDisplay(
          Math.abs(diff),
          afterRes.baseUnit,
          afterRes.displayUnit
        )}`,
      });
    }

    if (beforeRes.status !== afterRes.status) {
      transitions.push({
        entityType: "resource",
        entityId: afterRes.id,
        entityLabel: afterRes.canonicalName,
        field: "status",
        before: beforeRes.status,
        after: afterRes.status,
      });
    }
  }

  for (const afterMeal of after.mealPlans) {
    const beforeMeal = before.mealPlans.find((m) => m.id === afterMeal.id);
    if (!beforeMeal) {
      transitions.push({
        entityType: "meal_plan",
        entityId: afterMeal.id,
        entityLabel: `${afterMeal.dishName} × ${afterMeal.servings}`,
        field: "status",
        before: null,
        after: afterMeal.status,
      });
    } else if (beforeMeal.status !== afterMeal.status) {
      transitions.push({
        entityType: "meal_plan",
        entityId: afterMeal.id,
        entityLabel: `${afterMeal.dishName} × ${afterMeal.servings}`,
        field: "status",
        before: beforeMeal.status,
        after: afterMeal.status,
      });
    }
  }

  for (const afterAct of after.actions) {
    const beforeAct = before.actions.find((a) => a.id === afterAct.id);
    if (!beforeAct) {
      transitions.push({
        entityType: "action",
        entityId: afterAct.id,
        entityLabel: afterAct.title,
        field: "status",
        before: null,
        after: afterAct.status,
      });
    } else if (beforeAct.status !== afterAct.status) {
      transitions.push({
        entityType: "action",
        entityId: afterAct.id,
        entityLabel: afterAct.title,
        field: "status",
        before: beforeAct.status,
        after: afterAct.status,
      });
    }
  }

  for (const afterExp of after.expectations) {
    const beforeExp = before.expectations.find((e) => e.id === afterExp.id);
    if (!beforeExp) {
      transitions.push({
        entityType: "expectation",
        entityId: afterExp.id,
        entityLabel: `${afterExp.resourceName} (${afterExp.expectedDisplay})`,
        field: "status",
        before: null,
        after: afterExp.status,
      });
    } else if (beforeExp.status !== afterExp.status) {
      transitions.push({
        entityType: "expectation",
        entityId: afterExp.id,
        entityLabel: `${afterExp.resourceName} (${afterExp.expectedDisplay})`,
        field: "status",
        before: beforeExp.status,
        after: afterExp.status,
        deltaDisplay: afterExp.discrepancyDisplay ?? undefined,
      });
    }
  }

  return transitions;
}

export function buildCanonicalSeedState(
  mode: "pre-receipt" | "post-receipt" = "pre-receipt"
): CanonicalStateData {
  const now = new Date();
  const nowIso = now.toISOString();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const in5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const householdId = "hh_demo_001";

  const households: Household[] = [
    {
      id: householdId,
      name: "Adyar Residence · Household Intelligence",
      timezone: "Asia/Kolkata",
      createdAt: nowIso,
    },
  ];

  const members: Member[] = [
    {
      id: "usr_sai_001",
      householdId,
      name: "Sai Charan",
      role: "ADMIN",
      phoneE164: "+919840112233",
    },
    {
      id: "usr_kavya_002",
      householdId,
      name: "Kavya",
      role: "MEMBER",
      phoneE164: "+919840445566",
    },
  ];

  const vendors: Vendor[] = [
    {
      id: "vnd_nellai_meats",
      householdId,
      name: "Nellai Fresh Meats & Provisions",
      phoneE164: "+919840000000",
      categories: ["protein", "dairy", "grain", "produce"],
      snapserveAgentId: 101,
      isPreferred: true,
    },
    {
      id: "vnd_kovai_greens",
      householdId,
      name: "Kovai Pazhamudir Nilayam",
      phoneE164: "+919840000001",
      categories: ["produce", "dairy", "spice"],
      snapserveAgentId: 102,
      isPreferred: false,
    },
  ];

  const lots: InventoryLot[] = [
    {
      id: "lot_rice_01",
      resourceId: "res_rice",
      quantityRemaining: 5000,
      unitCostInr: 620,
      purchasedAt: nowIso,
      expiresAt: in90Days,
      sourceEventId: "evt_seed_receipt_001",
      status: "ACTIVE",
    },
    {
      id: "lot_chicken_01",
      resourceId: "res_chicken",
      quantityRemaining: 700,
      unitCostInr: 210,
      purchasedAt: nowIso,
      expiresAt: in2Days,
      sourceEventId: "evt_seed_receipt_001",
      status: "ACTIVE",
    },
    {
      id: "lot_onion_01",
      resourceId: "res_onion",
      quantityRemaining: 2000,
      unitCostInr: 90,
      purchasedAt: nowIso,
      expiresAt: in14Days,
      sourceEventId: "evt_seed_receipt_001",
      status: "ACTIVE",
    },
    {
      id: "lot_tomato_01",
      resourceId: "res_tomato",
      quantityRemaining: 600,
      unitCostInr: 40,
      purchasedAt: nowIso,
      expiresAt: in24h,
      status: "ACTIVE",
    },
    {
      id: "lot_curd_01",
      resourceId: "res_curd",
      quantityRemaining: 200,
      unitCostInr: 30,
      purchasedAt: nowIso,
      expiresAt: in24h,
      sourceEventId: "evt_seed_receipt_001",
      status: "ACTIVE",
    },
    {
      id: "lot_ghee_01",
      resourceId: "res_ghee",
      quantityRemaining: 350,
      unitCostInr: 280,
      purchasedAt: nowIso,
      expiresAt: in90Days,
      status: "ACTIVE",
    },
    {
      id: "lot_spices_01",
      resourceId: "res_spices",
      quantityRemaining: 180,
      unitCostInr: 160,
      purchasedAt: nowIso,
      expiresAt: in90Days,
      status: "ACTIVE",
    },
    {
      id: "lot_mint_01",
      resourceId: "res_mint",
      quantityRemaining: 80,
      unitCostInr: 20,
      purchasedAt: nowIso,
      expiresAt: in24h,
      status: "ACTIVE",
    },
    {
      id: "lot_oil_01",
      resourceId: "res_oil",
      quantityRemaining: 1200,
      unitCostInr: 210,
      purchasedAt: nowIso,
      expiresAt: in90Days,
      status: "ACTIVE",
    },
    {
      id: "lot_dal_01",
      resourceId: "res_toor_dal",
      quantityRemaining: 850,
      unitCostInr: 150,
      purchasedAt: nowIso,
      expiresAt: in90Days,
      status: "ACTIVE",
    },
  ];

  const rawResources: Array<
    Omit<
      Resource,
      | "netAvailableQuantity"
      | "deficitQuantity"
      | "status"
      | "formattedOnHand"
      | "formattedReserved"
      | "formattedIncoming"
      | "formattedNetAvailable"
      | "formattedDeficit"
      | "daysUntilDepletion"
    >
  > = [
    {
      id: "res_rice",
      householdId,
      canonicalName: "Basmati Rice",
      aliases: [
        "basmati rice",
        "india gate basmati rice",
        "biryani rice",
        "arisi",
        "basmati arisi",
        "rice",
        "basmati 5kg",
        "அரிசி",
        "பாஸ்மதி அரிசி",
      ],
      category: "grain",
      baseUnit: "g",
      displayUnit: "kg",
      onHandQuantity: 5000,
      reservedQuantity: 0,
      incomingQuantity: 0,
      safetyThreshold: 1000,
      avgDailyBurn: 250,
      nearestExpiryAt: in90Days,
      updatedAt: nowIso,
    },
    {
      id: "res_chicken",
      householdId,
      canonicalName: "Chicken",
      aliases: [
        "chicken",
        "fresh country chicken",
        "fresh country chicken (skinless)",
        "chicken curry cut",
        "biryani cut chicken",
        "kozhi",
        "chikken",
        "கோழி",
      ],
      category: "protein",
      baseUnit: "g",
      displayUnit: "g",
      onHandQuantity: 700,
      reservedQuantity: 0,
      incomingQuantity: 0,
      safetyThreshold: 500,
      avgDailyBurn: 200,
      nearestExpiryAt: in2Days,
      updatedAt: nowIso,
    },
    {
      id: "res_onion",
      householdId,
      canonicalName: "Onion",
      aliases: [
        "onion",
        "red onion",
        "bellary onion",
        "bellary red onion",
        "vengayam",
        "pyaaz",
        "வெங்காயம்",
      ],
      category: "produce",
      baseUnit: "g",
      displayUnit: "kg",
      onHandQuantity: 2000,
      reservedQuantity: 0,
      incomingQuantity: 0,
      safetyThreshold: 500,
      avgDailyBurn: 180,
      nearestExpiryAt: in14Days,
      updatedAt: nowIso,
    },
    {
      id: "res_tomato",
      householdId,
      canonicalName: "Tomato",
      aliases: ["tomato", "nattu thakkali", "thakkali", "tomatoes", "தக்காளி"],
      category: "produce",
      baseUnit: "g",
      displayUnit: "g",
      onHandQuantity: 600,
      reservedQuantity: 0,
      incomingQuantity: 0,
      safetyThreshold: 300,
      avgDailyBurn: 150,
      nearestExpiryAt: in24h,
      updatedAt: nowIso,
    },
    {
      id: "res_curd",
      householdId,
      canonicalName: "Curd",
      aliases: [
        "curd",
        "yogurt",
        "thayir",
        "aavin curd",
        "aavin thick curd pouch",
        "dahi",
        "fresh curd",
        "தயிர்",
      ],
      category: "dairy",
      baseUnit: "ml",
      displayUnit: "ml",
      onHandQuantity: 200,
      reservedQuantity: 0,
      incomingQuantity: 0,
      safetyThreshold: 200,
      avgDailyBurn: 120,
      nearestExpiryAt: in24h,
      updatedAt: nowIso,
    },
    {
      id: "res_ghee",
      householdId,
      canonicalName: "Ghee",
      aliases: ["ghee", "nei", "aavin ghee", "cow ghee", "நெய்"],
      category: "dairy",
      baseUnit: "ml",
      displayUnit: "ml",
      onHandQuantity: 350,
      reservedQuantity: 0,
      incomingQuantity: 0,
      safetyThreshold: 100,
      avgDailyBurn: 25,
      nearestExpiryAt: in90Days,
      updatedAt: nowIso,
    },
    {
      id: "res_spices",
      householdId,
      canonicalName: "Biryani Masala & Whole Spices",
      aliases: ["biryani masala", "whole spices", "garam masala", "spices"],
      category: "spices",
      baseUnit: "g",
      displayUnit: "g",
      onHandQuantity: 180,
      reservedQuantity: 0,
      incomingQuantity: 0,
      safetyThreshold: 50,
      avgDailyBurn: 15,
      nearestExpiryAt: in90Days,
      updatedAt: nowIso,
    },
    {
      id: "res_mint",
      householdId,
      canonicalName: "Mint & Coriander Leaves",
      aliases: ["mint", "pudina", "coriander", "kothamalli", "mint leaves", "புதினா"],
      category: "produce",
      baseUnit: "g",
      displayUnit: "g",
      onHandQuantity: 80,
      reservedQuantity: 0,
      incomingQuantity: 0,
      safetyThreshold: 40,
      avgDailyBurn: 30,
      nearestExpiryAt: in24h,
      updatedAt: nowIso,
    },
    {
      id: "res_oil",
      householdId,
      canonicalName: "Cold-Pressed Groundnut Oil",
      aliases: ["oil", "groundnut oil", "cooking oil", "ennai", "எண்ணெய்"],
      category: "pantry",
      baseUnit: "ml",
      displayUnit: "L",
      onHandQuantity: 1200,
      reservedQuantity: 0,
      incomingQuantity: 0,
      safetyThreshold: 400,
      avgDailyBurn: 60,
      nearestExpiryAt: in90Days,
      updatedAt: nowIso,
    },
    {
      id: "res_toor_dal",
      householdId,
      canonicalName: "Toor Dal",
      aliases: ["toor dal", "thuvaram paruppu", "dal", "paruppu", "பருப்பு"],
      category: "grain",
      baseUnit: "g",
      displayUnit: "g",
      onHandQuantity: 850,
      reservedQuantity: 0,
      incomingQuantity: 0,
      safetyThreshold: 300,
      avgDailyBurn: 80,
      nearestExpiryAt: in90Days,
      updatedAt: nowIso,
    },
  ];

  const resources = rawResources.map((r) => computeResourceDerivedFields(r, lots));

  const recipes: Recipe[] = [
    {
      id: "rcp_chicken_biryani",
      householdId,
      name: "Chicken Biryani",
      aliases: ["biryani", "chicken biryani", "kozhi biryani", "dum biryani"],
      defaultServings: 6,
      ingredients: [
        {
          id: "ri_cb_chicken",
          recipeId: "rcp_chicken_biryani",
          resourceId: "res_chicken",
          resourceName: "Chicken",
          qtyPerServing: 250,
          baseUnit: "g",
          displayUnit: "g",
          isCritical: true,
        },
        {
          id: "ri_cb_rice",
          recipeId: "rcp_chicken_biryani",
          resourceId: "res_rice",
          resourceName: "Basmati Rice",
          qtyPerServing: 200,
          baseUnit: "g",
          displayUnit: "g",
          isCritical: true,
        },
        {
          id: "ri_cb_onion",
          recipeId: "rcp_chicken_biryani",
          resourceId: "res_onion",
          resourceName: "Onion",
          qtyPerServing: 100,
          baseUnit: "g",
          displayUnit: "g",
          isCritical: true,
        },
        {
          id: "ri_cb_tomato",
          recipeId: "rcp_chicken_biryani",
          resourceId: "res_tomato",
          resourceName: "Tomato",
          qtyPerServing: 80,
          baseUnit: "g",
          displayUnit: "g",
          isCritical: true,
        },
        {
          id: "ri_cb_curd",
          recipeId: "rcp_chicken_biryani",
          resourceId: "res_curd",
          resourceName: "Curd",
          qtyPerServing: 50,
          baseUnit: "ml",
          displayUnit: "ml",
          isCritical: true,
        },
        {
          id: "ri_cb_ghee",
          recipeId: "rcp_chicken_biryani",
          resourceId: "res_ghee",
          resourceName: "Ghee",
          qtyPerServing: 10,
          baseUnit: "ml",
          displayUnit: "ml",
          isCritical: false,
        },
        {
          id: "ri_cb_spices",
          recipeId: "rcp_chicken_biryani",
          resourceId: "res_spices",
          resourceName: "Biryani Masala & Whole Spices",
          qtyPerServing: 8,
          baseUnit: "g",
          displayUnit: "g",
          isCritical: true,
        },
      ],
    },
    {
      id: "rcp_veg_pulao",
      householdId,
      name: "Vegetable Pulao & Onion Raita",
      aliases: ["veg pulao", "pulao", "vegetable biryani"],
      defaultServings: 4,
      ingredients: [
        {
          id: "ri_vp_rice",
          recipeId: "rcp_veg_pulao",
          resourceId: "res_rice",
          resourceName: "Basmati Rice",
          qtyPerServing: 80,
          baseUnit: "g",
          displayUnit: "g",
          isCritical: true,
        },
        {
          id: "ri_vp_onion",
          recipeId: "rcp_veg_pulao",
          resourceId: "res_onion",
          resourceName: "Onion",
          qtyPerServing: 30,
          baseUnit: "g",
          displayUnit: "g",
          isCritical: true,
        },
        {
          id: "ri_vp_curd",
          recipeId: "rcp_veg_pulao",
          resourceId: "res_curd",
          resourceName: "Curd",
          qtyPerServing: 40,
          baseUnit: "ml",
          displayUnit: "ml",
          isCritical: true,
        },
      ],
    },
    {
      id: "rcp_sambar_rice",
      householdId,
      name: "Tiffin Sambar & Steamed Rice",
      aliases: ["sambar", "sambar sadam", "dal rice"],
      defaultServings: 4,
      ingredients: [
        {
          id: "ri_sr_dal",
          recipeId: "rcp_sambar_rice",
          resourceId: "res_toor_dal",
          resourceName: "Toor Dal",
          qtyPerServing: 40,
          baseUnit: "g",
          displayUnit: "g",
          isCritical: true,
        },
        {
          id: "ri_sr_tomato",
          recipeId: "rcp_sambar_rice",
          resourceId: "res_tomato",
          resourceName: "Tomato",
          qtyPerServing: 35,
          baseUnit: "g",
          displayUnit: "g",
          isCritical: true,
        },
        {
          id: "ri_sr_onion",
          recipeId: "rcp_sambar_rice",
          resourceId: "res_onion",
          resourceName: "Onion",
          qtyPerServing: 25,
          baseUnit: "g",
          displayUnit: "g",
          isCritical: true,
        },
      ],
    },
  ];

  const obligations: Obligation[] = [
    {
      id: "obl_vehicle_service",
      householdId,
      category: "vehicle",
      title: "Honda City · Annual Periodic Service & Emission Check",
      subtitle: "42,100 km · Due before weekend highway trip to Pondicherry",
      dueDate: in2Days,
      daysUntilDue: 2,
      amountInr: 4800,
      status: "DUE_SOON",
      dependentEntity: "Weekend Highway Trip (Saturday 6:00 AM)",
      conflictDescription:
        "Delaying service beyond Friday risks brake-pad & PUC non-compliance for Saturday morning highway travel.",
    },
    {
      id: "obl_tneb_bill",
      householdId,
      category: "utility",
      title: "TNEB Bi-Monthly Electricity Bill (Adyar Meter #09-224)",
      subtitle: "Auto-detected utility cycle · ₹2,450",
      dueDate: in5Days,
      daysUntilDue: 5,
      amountInr: 2450,
      status: "DUE_SOON",
      dependentEntity: "Household Utility Continuity",
      conflictDescription: "Late fee of ₹50 applies after due date.",
    },
    {
      id: "obl_passport_doc",
      householdId,
      category: "document",
      title: "Vehicle Insurance Policy Renewal (ICICI Lombard)",
      subtitle: "Zero-depreciation cover expires in 14 days",
      dueDate: in14Days,
      daysUntilDue: 14,
      amountInr: 11200,
      status: "UPCOMING",
      dependentEntity: "Honda City (TN-07-CX-4419)",
    },
  ];

  const forecasts: Forecast[] = [
    {
      id: "fc_chicken_low",
      householdId,
      targetType: "resource",
      targetId: "res_chicken",
      targetName: "Chicken",
      riskType: "SHORTAGE_RISK",
      severity: "HIGH",
      predictedDate: in24h,
      daysRemaining: 1,
      headline: "Chicken stock (400 g) is below 500 g safety threshold",
      explanation:
        "Only 400 g on hand. Any 6-serving Chicken Biryani meal requires 1.2 kg (800 g deficit).",
      updatedAt: nowIso,
    },
    {
      id: "fc_curd_expiring",
      householdId,
      targetType: "resource",
      targetId: "res_curd",
      targetName: "Curd",
      riskType: "EXPIRY_RISK",
      severity: "MEDIUM",
      predictedDate: in24h,
      daysRemaining: 1,
      headline: "Curd (80 ml) expires within 24 hours & is below 200 ml threshold",
      explanation:
        "Lot #lot_curd_01 expires tomorrow and 80 ml is insufficient for marinade + raita (needs 180 ml).",
      updatedAt: nowIso,
    },
    {
      id: "fc_tomato_expiring",
      householdId,
      targetType: "resource",
      targetId: "res_tomato",
      targetName: "Tomato",
      riskType: "EXPIRY_RISK",
      severity: "MEDIUM",
      predictedDate: in24h,
      daysRemaining: 1,
      headline: "600 g Tomatoes ripen past peak within 24 hours",
      explanation:
        "Prioritize Tomato-heavy dishes (Chicken Biryani or Tiffin Sambar) over the next 24 hours to prevent waste.",
      updatedAt: nowIso,
    },
    {
      id: "fc_vehicle_compliance",
      householdId,
      targetType: "obligation",
      targetId: "obl_vehicle_service",
      targetName: "Honda City · Annual Periodic Service",
      riskType: "COMPLIANCE_RISK",
      severity: "HIGH",
      predictedDate: in2Days,
      daysRemaining: 2,
      headline: "Vehicle service due in 2 days — blocks Saturday highway trip",
      explanation:
        "Odometer at 42,100 km + PUC renewal window overlaps with planned weekend travel.",
      updatedAt: nowIso,
    },
  ];

  const timeline: TimelineEntry[] = [
    {
      id: "tl_seed_01",
      householdId,
      eventId: "evt_seed_receipt_001",
      timestamp: nowIso,
      timeFormatted: now.toTimeString().slice(0, 5),
      title: "Household state synchronized",
      description:
        "10 kitchen resources, 10 active lots, and 3 household obligations verified in canonical ledger.",
      category: "inventory",
      status: "INFO",
    },
  ];

  return {
    stateVersion: 1,
    households,
    members,
    vendors,
    resources,
    lots,
    receiptUploads: [],
    recipes,
    mealPlans: [],
    events: [],
    relationships: [],
    obligations,
    forecasts,
    actions: [],
    outcomes: [],
    expectations: [],
    rippleGraphs: {},
    agentRuns: [],
    timeline,
    auditLogs: [],
    approvalTokens: {},
    idempotencyCache: {},
  };
}

// Alias kept for the concurrent rewrite's import surface (hh id parameter form)
export function createCanonicalSeedState(
  householdId = "hh_demo_001"
): CanonicalStateData {
  void householdId;
  return buildCanonicalSeedState("pre-receipt");
}

/**
 * What a first-time signed-in user starts with: an empty household. No stock,
 * receipts, bills, meals, forecasts, vendors or history. Only the canonical
 * recipes the meal engine needs are carried over from the demo seed.
 */
export function buildFreshUserState(): CanonicalStateData {
  const seed = buildCanonicalSeedState("pre-receipt");
  const householdId = "hh_demo_001";
  return {
    ...emptyCanonicalState(),
    households: [
      {
        id: householdId,
        name: "My household",
        timezone: "Asia/Kolkata",
        createdAt: new Date().toISOString(),
      },
    ],
    members: [{ id: "usr_owner", householdId, name: "You", role: "OWNER", relation: "self" }],
    // A household's vendors are the ones it adds in Setup. The demo vendors have made-up phone numbers,
    // so they are never carried over to a real household.
    vendors: [],
    recipes: seed.recipes,
    profile: emptyHouseholdProfile(),
  };
}

/** The demo household: the kitchen seed plus a fully filled-in family, documents, vehicles, bills, subscriptions and vendors. */
export function buildDemoUserState(): CanonicalStateData {
  return buildDemoHousehold(buildCanonicalSeedState("pre-receipt"));
}

export interface StoreOptions {
  /** Builds the state a brand-new store starts from and resets to. Defaults to the demo seed. */
  seed?: () => CanonicalStateData;
  /** Called with the full state after every change, for external persistence (e.g. Postgres). */
  onPersist?: (state: CanonicalStateData) => void;
}

export interface AuditInfo {
  householdId: string;
  actor: string;
  operation: string;
  entityType: string;
  entityId: string;
}

export class HouseholdStore {
  private state: CanonicalStateData;
  private readonly persistFilePath: string | null;
  private readonly seedFactory: (() => CanonicalStateData) | null;
  private readonly onPersist: ((state: CanonicalStateData) => void) | null;

  constructor(persistFilePath?: string | null, initialState?: CanonicalStateData, options: StoreOptions = {}) {
    this.seedFactory = options.seed ?? null;
    this.onPersist = options.onPersist ?? null;
    if (persistFilePath === null) {
      this.persistFilePath = null;
      this.state = initialState ? structuredClone(initialState) : this.newSeedState();
      return;
    }

    const defaultPath = process.env.VERCEL
      ? path.resolve("/tmp", "household-state.json")
      : path.resolve(process.cwd(), ".data", "household-state.json");
    this.persistFilePath = persistFilePath ?? defaultPath;
    this.state = initialState
      ? structuredClone(initialState)
      : this.loadOrInitialize();
  }

  private newSeedState(mode: "pre-receipt" | "post-receipt" = "pre-receipt"): CanonicalStateData {
    return this.seedFactory ? this.seedFactory() : buildCanonicalSeedState(mode);
  }

  private loadOrInitialize(): CanonicalStateData {
    if (this.persistFilePath) {
      try {
        if (fs.existsSync(this.persistFilePath)) {
          const raw = fs.readFileSync(this.persistFilePath, "utf8");
          const parsed = JSON.parse(raw) as CanonicalStateData;
          if (parsed && Array.isArray(parsed.resources)) {
            if (typeof parsed.stateVersion !== "number") {
              parsed.stateVersion = 1;
            }
            if (!Array.isArray(parsed.expectations)) {
              parsed.expectations = [];
            }
            return parsed;
          }
        }
      } catch {
        // Fall through to canonical seed
      }
    }
    const seed = this.newSeedState();
    this.saveToDisk(seed);
    return seed;
  }

  private saveToDisk(data: CanonicalStateData): void {
    this.onPersist?.(data);
    if (!this.persistFilePath) return;
    try {
      const dir = path.dirname(this.persistFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.persistFilePath, JSON.stringify(data, null, 2), "utf8");
    } catch {
      // Non-fatal in read-only or ephemeral test environments
    }
  }

  public getState(): CanonicalStateData {
    return this.state;
  }

  /**
   * Creates an isolated, in-memory-only fork of the current HouseholdState
   * in <1ms so counterfactual simulations can run full domain logic without
   * mutating disk or canonical database state.
   */
  public createEphemeralFork(): HouseholdStore {
    return new HouseholdStore(null, this.state);
  }

  public mutate<T>(
    mutator: (draft: CanonicalStateData) => T,
    auditInfo?: AuditInfo
  ): T {
    const beforeSnapshot = this.state;
    const draft = structuredClone(this.state);
    const result = mutator(draft);

    // Recompute all resource derived fields before computing state transitions
    const hid = auditInfo?.householdId || draft.households[0]?.id || "hh_demo_001";
    draft.resources = draft.resources.map((r) =>
      r.householdId === hid ? computeResourceDerivedFields(r, draft.lots) : r
    );

    const transitions = computeStateTransitions(beforeSnapshot, draft);
    if (transitions.length > 0 || auditInfo) {
      draft.stateVersion = (draft.stateVersion || 1) + 1;
    }

    // Attach transitions and stateVersion to the latest event if one was added
    if (draft.events.length > beforeSnapshot.events.length && draft.events[0]) {
      draft.events[0].transitions = transitions;
      draft.events[0].stateVersion = draft.stateVersion;
    }

    if (auditInfo) {
      draft.auditLogs.unshift({
        id: `aud_${crypto.randomUUID().slice(0, 8)}`,
        ...auditInfo,
        stateVersion: draft.stateVersion,
        transitions,
        beforeState: { stateVersion: beforeSnapshot.stateVersion },
        afterState: {
          stateVersion: draft.stateVersion,
          transitionCount: transitions.length,
        },
        createdAt: new Date().toISOString(),
      });
    }

    this.state = draft;
    this.saveToDisk(draft);
    return result;
  }

  public resetToCanonicalSeed(
    mode: "pre-receipt" | "post-receipt" = "pre-receipt"
  ): CanonicalStateData {
    const fresh = this.newSeedState(mode);
    this.state = fresh;
    this.saveToDisk(fresh);
    return fresh;
  }

  public recomputeAllResources(householdId: string): Resource[] {
    const updated = this.state.resources.map((r) => {
      if (r.householdId !== householdId) return r;
      return computeResourceDerivedFields(r, this.state.lots);
    });
    this.state.resources = updated;
    this.saveToDisk(this.state);
    return updated.filter((r) => r.householdId === householdId);
  }

  public getIdempotentResult<T>(key?: string): T | undefined {
    if (!key) return undefined;
    const hit = this.state.idempotencyCache[key];
    return hit ? (hit.result as T) : undefined;
  }

  public setIdempotentResult(key: string | undefined, result: unknown): void {
    if (!key) return;
    this.state.idempotencyCache[key] = {
      createdAt: new Date().toISOString(),
      result,
    };
    this.saveToDisk(this.state);
  }
}

export const db = new HouseholdStore();
