// SmartKitchen AI — Mock types for the kitchen management application.
// These mirror packages/contracts schemas and will be served by the real API later.

export type InventoryStatus = "available" | "low" | "expiring" | "critical";

export interface InventoryLot {
  id: string;
  itemId: string;
  quantity: number;
  unit: string;
  purchasedAt: string;
  expiresAt?: string;
  source: string;
}

export interface InventoryHistoryEntry {
  date: string;
  delta: number;
  label: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  lowThreshold: number;
  expiry?: string;
  dailyConsumption: number;
  daysRemaining?: number;
  price?: number;
  emoji?: string;
  // 3-Tier Canonical Ledger fields
  formattedOnHand?: string;
  formattedReserved?: string;
  formattedIncoming?: string;
  formattedNetAvailable?: string;
  formattedDeficit?: string;
  onHandQuantity?: number;
  reservedQuantity?: number;
  incomingQuantity?: number;
  effectiveAvailableQuantity?: number;
  deficitQuantity?: number;
  history: InventoryHistoryEntry[];
  lots: InventoryLot[];
}

export interface RecipeIngredient {
  itemId: string;
  name: string;
  quantityPerServing: number;
  unit: string;
}

export interface Recipe {
  id: string;
  name: string;
  cuisine: string;
  servings: number;
  prepTime?: number;
  cookTime?: number;
  difficulty?: "easy" | "medium" | "hard";
  tags?: string[];
  emoji?: string;
  canMakeNow?: boolean;
  missingCount?: number;
  ingredients: RecipeIngredient[];
}

export type MealStatus = "planned" | "confirmed" | "completed";

export interface MealPlan {
  id: string;
  recipeId: string;
  recipeName: string;
  servings: number;
  date: string;
  slot: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  status: MealStatus;
  prepTime?: number;
  emoji?: string;
}

export type SimulationRowStatus = "AVAILABLE" | "LOW" | "MISSING" | "EXPIRING";

export interface MealSimulationRow {
  itemId: string;
  name: string;
  required: number;
  unit: string;
  available: number;
  status: SimulationRowStatus;
  shortfall?: number;
}

export interface MealSimulation {
  recipeId: string;
  recipeName: string;
  servings: number;
  rows: MealSimulationRow[];
}

export type RippleNodeState =
  | "planned"
  | "available"
  | "short"
  | "warning"
  | "proposed";

export interface RippleWhyEvidence {
  id?: string;
  resourceId?: string;
  resourceName: string;
  headline: string;
  triggerEventLabel: string;
  requiredDisplay: string;
  onHandDisplay: string;
  reservedOtherDisplay?: string;
  incomingDisplay?: string;
  deficitDisplay: string;
  proposedResolution: string;
  sources: string[];
}

export interface RippleNode {
  id: string;
  label: string;
  state: RippleNodeState;
  depth: number;
  detail?: string;
  type?: string;
  whyEvidence?: RippleWhyEvidence;
}

export interface RippleEdge {
  from: string;
  to: string;
  label: string;
}

export interface RippleGraph {
  eventId: string;
  title: string;
  subtitle?: string;
  summary?: string;
  shortageCount?: number;
  nodes: RippleNode[];
  edges: RippleEdge[];
}

export interface StateTransitionItem {
  entityType: "resource" | "meal_plan" | "obligation" | "action" | "expectation";
  entityId: string;
  entityLabel: string;
  entityName?: string;
  field: string;
  before: number | string | null;
  after: number | string | null;
  deltaDisplay?: string;
}

export interface CounterfactualIngredientDeltaItem {
  resourceId: string;
  name: string;
  baselineRequiredDisplay: string;
  simulatedRequiredDisplay: string;
  availableDisplay: string;
  baselineDeficitDisplay: string;
  simulatedDeficitDisplay: string;
  deltaDisplay: string;
  additionalCostInr: number;
  statusBefore: string;
  statusAfter: string;
  newlyShort: boolean;
}

export interface CounterfactualSimulationData {
  householdId: string;
  stateVersion: number;
  recipeId: string;
  recipeName: string;
  baselineServings: number;
  simulatedServings: number;
  baselineShortageCount: number;
  simulatedShortageCount: number;
  baselineOrderCostInr: number;
  simulatedOrderCostInr: number;
  deltaCostInr: number;
  additionalActionsCount: number;
  competingMealsAffected: Array<{
    mealTitle: string;
    resourceName: string;
    impactSummary: string;
  }>;
  ingredientDeltas: CounterfactualIngredientDeltaItem[];
  stateDiffs: StateTransitionItem[];
  simulatedRippleGraph: RippleGraph;
}

export type ActionStatus =
  | "proposed"
  | "approved"
  | "executing"
  | "confirmed"
  | "failed"
  | "rejected";

export type SnapserveState =
  | "Preparing"
  | "Calling"
  | "Connected"
  | "Awaiting response"
  | "Confirmed"
  | "Failed"
  | "Unknown";

export interface ExpectationItem {
  id: string;
  actionId: string;
  resourceId: string;
  resourceName: string;
  vendorName: string;
  expectedQty: number;
  verifiedQty: number | null;
  discrepancyQty: number;
  expectedDisplay: string;
  verifiedDisplay: string | null;
  discrepancyDisplay: string | null;
  status: "AWAITING_DELIVERY" | "VERIFIED_MATCH" | "DISCREPANCY_DETECTED";
  verifiedAt: string | null;
}

export interface ActionItem {
  id: string;
  kind: "purchase" | "call" | "book" | "renew" | "pay" | "service";
  title: string;
  quantity: string;
  reason: string;
  evidence?: {
    required: string;
    available: string;
    deficit: string;
  };
  vendor: string;
  estimatedCost: string;
  status: ActionStatus;
  createdAt: string;
  expectations?: ExpectationItem[];
  execution: { state: SnapserveState; detail?: string; transcript?: string } | null;
}

export interface ActivityEntry {
  id: string;
  time: string;
  title: string;
  description: string;
  kind:
    | "meal"
    | "inventory"
    | "receipt"
    | "action"
    | "alert"
    | "agent"
    | "obligation";
}

export interface AgentStep {
  agent: string;
  detail: string;
  reason?: string;
}

export interface Forecast {
  id: string;
  itemId: string;
  itemName: string;
  type: "SHORTAGE_RISK" | "EXPIRY_RISK" | "WASTE_RISK" | "RECURRING_DEMAND";
  detail: string;
  horizonDays: number;
  severity: "high" | "medium" | "low";
  domain?: ObligationDomain | "kitchen";
}

export interface DashboardAttentionItem {
  id: string;
  title: string;
  description: string;
  href: string;
}

export interface DashboardData {
  stateVersion?: number;
  todayMeal: {
    id?: string;
    recipeName: string;
    servings: number;
    shortCount: number;
    status?: string;
  };
  inventorySummary: {
    total: number;
    low: number;
    expiring: number;
    totalItems?: number;
    lowStockCount?: number;
    expiringSoonCount?: number;
    reserved?: number;
    incoming?: number;
  };
  attentionItems: DashboardAttentionItem[];
  recentActivity: ActivityEntry[];
  obligationsSummary?: ObligationsSummary;
}

export type ObligationDomain =
  | "document"
  | "vehicle"
  | "subscription"
  | "bill"
  | "appointment";

export type ObligationStatus =
  | "ok"
  | "due_soon"
  | "overdue"
  | "action_proposed";

export interface Obligation {
  id: string;
  domain: ObligationDomain;
  title: string;
  provider: string;
  detail: string;
  dueDate?: string;
  amount?: string;
  recurrence?: "monthly" | "quarterly" | "yearly";
  status: ObligationStatus;
  linkedActionId?: string;
}

export interface ObligationsSummary {
  documents: { total: number; expiringSoon: number };
  vehicle: { dueSoon: number };
  subscriptions: { active: number; monthlyCost: string };
  bills: { dueSoon: number; amount: string };
  appointments: { upcoming: number };
}

// ── SmartKitchen AI specific types ────────────────────────────────────────

export interface CartItem {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  estimatedPrice: number;
  source: "auto" | "manual" | "recipe";
  reason?: string;
  platform?: "zepto" | "blinkit" | "manual";
}

export interface BudgetData {
  monthlyBudget: number;
  spent: number;
  remaining: number;
  projectedSpend: number;
  weeklyBreakdown: Array<{
    week: string;
    spent: number;
    budget: number;
  }>;
}

export interface FamilyMember {
  id: string;
  name: string;
  role: "admin" | "member";
  avatar?: string;
  lastActive?: string;
}

export interface WeeklyMealPlan {
  day: string;
  date: string;
  meals: MealPlan[];
  isToday?: boolean;
  cookingTimeAvailable?: number;
}
