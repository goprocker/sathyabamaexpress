// Shared contracts (TRD §25–26) — the single source of truth for event, entity,
// and API shapes. Consumed by web, api, domain, tools, integrations, agents, and tests.
import { z } from "zod";

// ============================================================================
// 1. Canonical Units & Primitives
// ============================================================================

export const BaseUnitSchema = z.enum(["g", "ml", "count"]);
export type BaseUnit = z.infer<typeof BaseUnitSchema>;

export const DisplayUnitSchema = z.enum([
  "kg",
  "g",
  "L",
  "ml",
  "pcs",
  "count",
  "pack",
]);
export type DisplayUnit = z.infer<typeof DisplayUnitSchema>;

export const IngredientStatusSchema = z.enum([
  "AVAILABLE",
  "LOW",
  "MISSING",
  "EXPIRING",
  "SURPLUS",
  "OK",
]);
export type IngredientStatus = z.infer<typeof IngredientStatusSchema>;

export const RiskSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type RiskSeverity = z.infer<typeof RiskSeveritySchema>;

// ============================================================================
// 2. Household, Members & Vendors
// ============================================================================

export const HouseholdSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  preferredLanguages: z.array(z.string()).optional(),
  createdAt: z.string(),
});
export type Household = z.infer<typeof HouseholdSchema>;

export const MemberSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string(),
  role: z.enum(["OWNER", "ADMIN", "ADULT", "MEMBER", "GUEST"]),
  dietaryPreferences: z.array(z.string()).optional(),
  phone: z.string().optional(),
  phoneE164: z.string().optional(),
});
export type Member = z.infer<typeof MemberSchema>;

export const VendorSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string(),
  category: z.string().optional(),
  categories: z.array(z.string()).optional(),
  phoneE164: z.string(),
  snapserveAgentId: z.number().int().optional(),
  averageDeliveryMinutes: z.number().int().optional(),
  reliabilityScore: z.number().min(0).max(1).optional(),
  isPreferred: z.boolean(),
});
export type Vendor = z.infer<typeof VendorSchema>;

// ============================================================================
// 3. Kitchen Inventory & Three-Tier Ledger
// ============================================================================

export const InventoryLotSchema = z.object({
  id: z.string(),
  householdId: z.string().optional(),
  resourceId: z.string(),
  quantityInitial: z.number().optional(),
  quantityRemaining: z.number(),
  baseUnit: BaseUnitSchema.optional(),
  costPerUnitInr: z.number().optional(),
  unitCostInr: z.number().optional(),
  purchasedAt: z.string(),
  expiresAt: z.string().nullable().optional(),
  sourceEventId: z.string().optional(),
  vendorName: z.string().optional(),
  status: z.enum(["ACTIVE", "DEPLETED", "EXPIRED", "EXPIRING_SOON"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type InventoryLot = z.infer<typeof InventoryLotSchema>;

export const ResourceSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  canonicalName: z.string(),
  aliases: z.array(z.string()),
  category: z.enum([
    "Grains",
    "Protein",
    "Produce",
    "Dairy",
    "Spices",
    "Pantry",
    "grain",
    "protein",
    "produce",
    "dairy",
    "spices",
    "pantry",
  ]),
  baseUnit: BaseUnitSchema,
  displayUnit: DisplayUnitSchema,
  onHandQuantity: z.number(),
  reservedQuantity: z.number(),
  incomingQuantity: z.number(),
  netAvailableQuantity: z.number(),
  deficitQuantity: z.number(),
  safetyThreshold: z.number(),
  avgDailyBurn: z.number(),
  daysUntilDepletion: z.number().nullable(),
  status: IngredientStatusSchema,
  nearestExpiryAt: z.string().nullable().optional(),
  formattedOnHand: z.string(),
  formattedReserved: z.string(),
  formattedIncoming: z.string(),
  formattedNetAvailable: z.string(),
  formattedDeficit: z.string(),
  updatedAt: z.string(),
});
export type Resource = z.infer<typeof ResourceSchema>;

// ============================================================================
// 4. Receipt Extraction & Confirmation
// ============================================================================

export const ExtractedReceiptItemSchema = z.object({
  id: z.string(),
  rawName: z.string(),
  rawLineText: z.string().optional(),
  matchedResourceId: z.string().nullable().optional(),
  canonicalName: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  baseQuantity: z.number().positive(),
  baseUnit: BaseUnitSchema,
  normalizedBaseQuantity: z.number().positive().optional(),
  normalizedBaseUnit: BaseUnitSchema.optional(),
  priceInr: z.number().nonnegative().optional(),
  expiryDate: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  confirmed: z.boolean().default(true),
});
export type ExtractedReceiptItem = z.infer<typeof ExtractedReceiptItemSchema>;

export const ReceiptUploadSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  vendorName: z.string(),
  purchaseDate: z.string(),
  purchasedAt: z.string().optional(),
  totalAmountInr: z.number().optional(),
  status: z.enum([
    "EXTRACTED_PENDING_REVIEW",
    "CONFIRMED",
    "COMMITTED",
    "FAILED",
  ]),
  overallConfidence: z.number().min(0).max(1).optional(),
  items: z.array(ExtractedReceiptItemSchema),
  rawText: z.string().optional(),
  createdAt: z.string(),
  committedAt: z.string().nullable().optional(),
});
export type ReceiptUpload = z.infer<typeof ReceiptUploadSchema>;

export const ConfirmReceiptInputSchema = z.object({
  householdId: z.string().default("hh_demo_001"),
  idempotencyKey: z.string().optional(),
  vendorName: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string().optional(),
      matchedResourceId: z.string().nullable().optional(),
      canonicalName: z.string(),
      quantity: z.number().positive(),
      unit: z.string(),
      priceInr: z.number().nonnegative().optional(),
      expiryDate: z.string().nullable().optional(),
      confirmed: z.boolean().default(true),
    }),
  ),
});
export type ConfirmReceiptInput = z.infer<typeof ConfirmReceiptInputSchema>;

// ============================================================================
// 5. Recipes, Meal Plans & Deterministic Meal Simulation
// ============================================================================

export const RecipeIngredientSchema = z.object({
  id: z.string().optional(),
  recipeId: z.string().optional(),
  resourceId: z.string(),
  resourceName: z.string(),
  qtyPerServing: z.number().positive(),
  baseUnit: BaseUnitSchema,
  displayUnit: DisplayUnitSchema,
  isCritical: z.boolean().default(true),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  defaultServings: z.number().int().positive(),
  prepMinutes: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
  ingredients: z.array(RecipeIngredientSchema),
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const SimulatedIngredientSchema = z.object({
  resourceId: z.string(),
  name: z.string(),
  category: z.string().optional(),
  baseUnit: BaseUnitSchema,
  displayUnit: DisplayUnitSchema,
  qtyPerServing: z.number(),
  requiredQty: z.number(),
  onHandQty: z.number(),
  reservedOtherQty: z.number(),
  existingReservedQty: z.number().optional(),
  incomingQty: z.number(),
  netAvailableQty: z.number(),
  postMealBalanceQty: z.number(),
  postMealRemainingQty: z.number().optional(),
  deficitQty: z.number(),
  formattedRequired: z.string(),
  formattedOnHand: z.string(),
  formattedAvailable: z.string(),
  formattedNetAvailable: z.string().optional(),
  formattedDeficit: z.string(),
  formattedPostMealBalance: z.string(),
  status: IngredientStatusSchema,
  isCritical: z.boolean().optional(),
  competingMeals: z.array(z.string()).optional(),
});
export type SimulatedIngredient = z.infer<typeof SimulatedIngredientSchema>;

export const MealSimulationInputSchema = z.object({
  householdId: z.string().default("hh_demo_001"),
  recipeId: z.string().optional(),
  dish: z.string().optional(),
  servings: z.number().int().min(1).max(30).default(6),
  plannedDate: z.string().optional(),
  mealSlot: z.enum(["breakfast", "lunch", "dinner"]).default("dinner"),
});
export type MealSimulationInput = z.infer<typeof MealSimulationInputSchema>;

export const MealCommitInputSchema = MealSimulationInputSchema.extend({
  idempotencyKey: z.string().optional(),
  source: z.enum(["ui", "voice", "agent"]).default("ui"),
  rawTranscript: z.string().optional(),
});
export type MealCommitInput = z.infer<typeof MealCommitInputSchema>;

export const MealPlanSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  recipeId: z.string(),
  dishName: z.string(),
  servings: z.number().int().positive(),
  plannedDate: z.string(),
  mealSlot: z.enum(["breakfast", "lunch", "dinner"]),
  status: z.enum([
    "SIMULATED",
    "PLANNED_SHORTAGE",
    "PLANNED_READY",
    "COOKED",
    "CONSUMED",
    "CANCELLED",
  ]),
  shortageCount: z.number().int().nonnegative(),
  sourceEventId: z.string(),
  createdAt: z.string(),
});
export type MealPlan = z.infer<typeof MealPlanSchema>;

// ============================================================================
// 6. Why? Evidence, Ripple Graph & Forecasts
// ============================================================================

export const WhyEvidenceSchema = z.object({
  id: z.string(),
  resourceId: z.string().optional(),
  resourceName: z.string().optional(),
  targetLabel: z.string().optional(),
  headline: z.string(),
  triggerEventLabel: z.string().optional(),
  triggerTimestamp: z.string().optional(),
  rawUtterance: z.string().optional(),
  recipePerServingDisplay: z.string().optional(),
  requiredQty: z.number().optional(),
  onHandQty: z.number().optional(),
  reservedOtherQty: z.number().optional(),
  incomingQty: z.number().optional(),
  deficitQty: z.number().optional(),
  unit: BaseUnitSchema.optional(),
  displayUnit: DisplayUnitSchema.optional(),
  requiredDisplay: z.string(),
  onHandDisplay: z.string(),
  reservedOtherDisplay: z.string().optional(),
  incomingDisplay: z.string().optional(),
  deficitDisplay: z.string(),
  formulaText: z.string().optional(),
  proposedResolution: z.string().optional(),
  vendorName: z.string().optional(),
  vendorPhoneMasked: z.string().optional(),
  sources: z.array(z.string()),
  competingEvents: z.array(z.string()).optional(),
  mealPlanId: z.string().optional(),
});
export type WhyEvidence = z.infer<typeof WhyEvidenceSchema>;

export const RippleNodeTypeSchema = z.enum([
  "EVENT",
  "MEAL",
  "RESOURCE",
  "SHORTAGE",
  "COMPETING_MEAL",
  "OBLIGATION",
  "FORECAST",
  "ACTION",
]);
export type RippleNodeType = z.infer<typeof RippleNodeTypeSchema>;

export const RippleNodeSchema = z.object({
  id: z.string(),
  type: RippleNodeTypeSchema,
  depth: z.number().int().min(0).max(4),
  label: z.string(),
  sublabel: z.string(),
  status: z.enum(["OK", "WARNING", "CRITICAL", "ACTION_REQUIRED", "RESOLVED"]),
  metricBadge: z.string().optional(),
  whyEvidence: WhyEvidenceSchema.optional(),
  resourceId: z.string().optional(),
  actionId: z.string().optional(),
  linkedActionId: z.string().optional(),
  linkedResourceId: z.string().optional(),
});
export type RippleNode = z.infer<typeof RippleNodeSchema>;

export const RippleEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  relation: z.string(),
  label: z.string().optional(),
});
export type RippleEdge = z.infer<typeof RippleEdgeSchema>;

export const RippleGraphSchema = z.object({
  eventId: z.string(),
  householdId: z.string(),
  title: z.string(),
  subtitle: z.string(),
  computedAt: z.string().optional(),
  createdAt: z.string().optional(),
  shortageCount: z.number().int().nonnegative(),
  summary: z.string(),
  nodes: z.array(RippleNodeSchema),
  edges: z.array(RippleEdgeSchema),
  explanations: z.array(WhyEvidenceSchema),
});
export type RippleGraph = z.infer<typeof RippleGraphSchema>;

export const ForecastSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  targetType: z.enum([
    "RESOURCE",
    "OBLIGATION",
    "ROUTINE",
    "resource",
    "obligation",
    "routine",
  ]),
  targetId: z.string(),
  targetName: z.string(),
  riskType: z.enum([
    "SHORTAGE_RISK",
    "EXPIRY_RISK",
    "WASTE_RISK",
    "RECURRING_DEMAND",
    "COMPLIANCE_RISK",
    "BILL_DUE_RISK",
    "SCHEDULE_CONFLICT_RISK",
  ]),
  severity: RiskSeveritySchema,
  daysRemaining: z.number(),
  predictedDate: z.string(),
  headline: z.string(),
  explanation: z.string(),
  recommendedAction: z.string().optional(),
  whyEvidence: WhyEvidenceSchema.optional(),
  updatedAt: z.string(),
});
export type Forecast = z.infer<typeof ForecastSchema>;

export const ObligationSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  category: z.enum([
    "BILL",
    "CHORE",
    "APPOINTMENT",
    "REMINDER",
    "MAINTENANCE",
    "vehicle",
    "utility",
    "subscription",
    "health",
    "routine",
    "document",
    "vehicle_service",
  ]),
  title: z.string(),
  subtitle: z.string(),
  dueDate: z.string(),
  dueAt: z.string().optional(),
  daysUntilDue: z.number().int(),
  amountInr: z.number().optional(),
  recurrence: z
    .enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"])
    .default("MONTHLY")
    .optional(),
  severity: RiskSeveritySchema.optional(),
  status: z.enum(["UPCOMING", "DUE_SOON", "OVERDUE", "COMPLETED"]),
  dependentEntity: z.string().optional(),
  assignedMemberName: z.string().optional(),
  conflictDescription: z.string().optional(),
  sourceEventId: z.string().optional(),
});
export type Obligation = z.infer<typeof ObligationSchema>;

// ============================================================================
// 7. Actions, Approval Tokens & Snapserve Execution
// ============================================================================

export const SnapserveCallStatusSchema = z.enum([
  "PREPARING",
  "CALLING",
  "CONNECTED",
  "AWAITING_RESPONSE",
  "CONFIRMED",
  "FAILED",
  "UNKNOWN",
]);
export type SnapserveCallStatus = z.infer<typeof SnapserveCallStatusSchema>;

export const ActionOrderItemSchema = z.object({
  resourceId: z.string(),
  name: z.string(),
  deficitDisplay: z.string(),
  orderQuantity: z.number().positive(),
  orderUnit: BaseUnitSchema,
  orderDisplay: z.string(),
  estimatedCostInr: z.number().nonnegative(),
});
export type ActionOrderItem = z.infer<typeof ActionOrderItemSchema>;

export const ActionOutcomeSchema = z.object({
  id: z.string(),
  actionId: z.string(),
  status: z.enum(["SUCCESS", "PARTIAL", "FAILED", "UNKNOWN"]),
  transcript: z.string(),
  vendorResponseSummary: z.string(),
  deliveryEta: z.string(),
  reconciledItems: z.array(
    z.object({
      resourceId: z.string(),
      name: z.string(),
      addedIncomingQty: z.number(),
      displayAdded: z.string(),
    }),
  ),
  reconciledAt: z.string(),
});
export type ActionOutcome = z.infer<typeof ActionOutcomeSchema>;

export const ActionProposalSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  sourceEventId: z.string(),
  type: z.enum(["VENDOR_PURCHASE_CALL", "BILL_REMINDER", "ROUTINE_ADJUSTMENT"]),
  status: z.enum([
    "PENDING_APPROVAL",
    "APPROVED",
    "EXECUTING",
    "CONFIRMED",
    "FAILED",
    "REJECTED",
  ]),
  title: z.string(),
  subtitle: z.string(),
  reasonSummary: z.string(),
  whyEvidence: z.array(WhyEvidenceSchema),
  items: z.array(ActionOrderItemSchema),
  targetVendor: VendorSchema.optional(),
  estimatedTotalCostInr: z.number().nonnegative(),
  deliveryWindow: z.string(),
  callScript: z.string(),
  payloadHash: z.string(),
  approvalRequired: z.boolean().default(true),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  externalCallId: z.string().nullable().optional(),
  externalCallStatus: SnapserveCallStatusSchema.nullable().optional(),
  callSteps: z.array(
    z.object({
      status: SnapserveCallStatusSchema,
      label: z.string(),
      timestamp: z.string(),
    }),
  ),
  outcome: ActionOutcomeSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ActionProposal = z.infer<typeof ActionProposalSchema>;

// ============================================================================
// 8. Multi-Agent Traceability & Activity Timeline
// ============================================================================

export const AgentRoleSchema = z.enum([
  "Supervisor",
  "IntakeAgent",
  "InventoryEngine",
  "MealEngine",
  "RippleEngine",
  "ForecastEngine",
  "ActionPlannerAgent",
  "ExecutionEngine",
  "ReconciliationAgent",
  "System",
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const ToolNameSchema = z.enum([
  "state.read",
  "state.compare",
  "event.read",
  "event.create",
  "event.record",
  "inventory.read",
  "inventory.simulate",
  "inventory.commit",
  "recipe.read",
  "graph.read",
  "ripple.compute",
  "forecast.run",
  "forecast.read",
  "forecast.compute",
  "action.read",
  "action.prepare",
  "approval.request",
  "snapserve.call",
  "snapserve.status",
  "outcome.reconcile",
]);
export type ToolName = z.infer<typeof ToolNameSchema>;

export const ToolCallTraceSchema = z.object({
  id: z.string().optional(),
  runId: z.string().optional(),
  agentStepId: z.string().optional(),
  toolName: ToolNameSchema,
  idempotencyKey: z.string().optional(),
  inputSummary: z.string(),
  outputSummary: z.string(),
  latencyMs: z.number().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
  status: z.enum(["OK", "SUCCESS", "BLOCKED", "FAILED", "ERROR"]),
  createdAt: z.string().optional(),
});
export type ToolCallTrace = z.infer<typeof ToolCallTraceSchema>;

export const AgentStepTraceSchema = z.object({
  id: z.string().optional(),
  runId: z.string().optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  stepOrder: z.number().int().positive().optional(),
  agentName: AgentRoleSchema,
  executionMode: z.enum(["LLM_AGENT", "DETERMINISTIC_ENGINE"]),
  action: z.string(),
  reason: z.string(),
  status: z.enum(["COMPLETED", "FAILED", "RUNNING"]).optional(),
  toolCalls: z.array(ToolCallTraceSchema),
  latencyMs: z.number().nonnegative(),
  createdAt: z.string().optional(),
  timestamp: z.string().optional(),
});
export type AgentStepTrace = z.infer<typeof AgentStepTraceSchema>;

export const AgentRunTraceSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  triggerEventId: z.string().optional(),
  triggerTitle: z.string().optional(),
  workflowType: z.string().optional(),
  status: z.enum(["RUNNING", "COMPLETED", "FAILED"]),
  totalLatencyMs: z.number().nonnegative(),
  steps: z.array(AgentStepTraceSchema),
  startedAt: z.string().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type AgentRunTrace = z.infer<typeof AgentRunTraceSchema>;

export const TimelineEntrySchema = z.object({
  id: z.string(),
  householdId: z.string(),
  eventId: z.string(),
  timestamp: z.string(),
  timeFormatted: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum([
    "receipt",
    "voice",
    "meal",
    "shortage",
    "action",
    "reconciliation",
    "obligation",
    "inventory",
  ]),
  status: z.enum(["INFO", "WARNING", "CRITICAL", "SUCCESS"]),
  agentRun: AgentRunTraceSchema.optional(),
  relatedActionId: z.string().optional(),
  relatedRippleEventId: z.string().optional(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

// ============================================================================
// 9. Voice & Natural Event Ingestion
// ============================================================================

export const StructuredVoiceIntentSchema = z.object({
  intent: z.enum([
    "MEAL_PLANNED",
    "PURCHASE_RECORDED",
    "INVENTORY_CHECK",
    "OBLIGATION_REMINDER",
  ]),
  dish: z.string().optional(),
  recipeId: z.string().optional(),
  servings: z.number().int().positive().default(6),
  plannedDate: z.string().default("tomorrow"),
  dateLabel: z.string().optional(),
  mealSlot: z.enum(["breakfast", "lunch", "dinner"]).default("dinner"),
  detectedLanguage: z.string().default("ta-IN (Tanglish)").optional(),
  confidence: z.number().min(0).max(1).default(0.95),
  summaryText: z.string().optional(),
});
export type StructuredVoiceIntent = z.infer<typeof StructuredVoiceIntentSchema>;

// ============================================================================
// 10. Dashboard Aggregate Contract
// ============================================================================

export const DashboardAttentionItemSchema = z.object({
  id: z.string(),
  type: z.enum([
    "MEAL_SHORTAGE",
    "EXPIRING_LOT",
    "OBLIGATION_DUE",
    "PENDING_ACTION",
  ]),
  title: z.string(),
  subtitle: z.string(),
  badgeText: z.string(),
  severity: RiskSeveritySchema,
  actionId: z.string().optional(),
  eventId: z.string().optional(),
  resourceId: z.string().optional(),
  whyEvidence: WhyEvidenceSchema.optional(),
});
export type DashboardAttentionItem = z.infer<
  typeof DashboardAttentionItemSchema
>;

export const DashboardResponseSchema = z.object({
  household: HouseholdSchema,
  greeting: z.string(),
  todayMeals: z.array(MealPlanSchema),
  inventorySummary: z.object({
    totalItems: z.number().int(),
    availableCount: z.number().int().optional(),
    lowCount: z.number().int(),
    shortCount: z.number().int(),
    expiringSoonCount: z.number().int(),
    reservedCount: z.number().int().optional(),
    incomingCount: z.number().int().optional(),
    total: z.number().int().optional(),
    low: z.number().int().optional(),
    expiring: z.number().int().optional(),
  }),
  attentionItems: z.array(DashboardAttentionItemSchema),
  pendingActions: z.array(ActionProposalSchema),
  recentActivity: z.array(TimelineEntrySchema),
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;

// ============================================================================
// 11. MVP Event Envelopes & Frontend Simulation Contracts (TRD §12, §25)
// ============================================================================

export const MealPlannedEvent = z.object({
  type: z.literal("MEAL_PLANNED"),
  dish: z.string(),
  servings: z.number().positive(),
  date: z.string(),
});

export const PurchaseRecordedEvent = z.object({
  type: z.literal("PURCHASE_RECORDED"),
  vendor: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().positive(),
      unit: z.string(),
      price: z.number().optional(),
      expiry: z.string().optional(),
    }),
  ),
});

export const MealConsumedEvent = z.object({
  type: z.literal("MEAL_CONSUMED"),
  recipeId: z.string(),
  servings: z.number().positive(),
  date: z.string(),
});

export const ActionApprovedEvent = z.object({
  type: z.literal("ACTION_APPROVED"),
  actionId: z.string(),
  approvedBy: z.string(),
});

export const ActionCompletedEvent = z.object({
  type: z.literal("ACTION_COMPLETED"),
  actionId: z.string(),
  outcome: z.enum(["SUCCESS", "FAILED", "UNKNOWN"]),
});

export const HouseholdEvent = z.discriminatedUnion("type", [
  MealPlannedEvent,
  PurchaseRecordedEvent,
  MealConsumedEvent,
  ActionApprovedEvent,
  ActionCompletedEvent,
]);
export type HouseholdEvent = z.infer<typeof HouseholdEvent>;

export const EventEnvelope = z.object({
  id: z.string(),
  householdId: z.string(),
  source: z.enum(["voice", "receipt", "manual", "agent"]),
  timestamp: z.string(),
  confidence: z.number().min(0).max(1),
  payload: HouseholdEvent,
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

export const SimulateMealRequest = z.object({
  recipeId: z.string(),
  servings: z.number().positive(),
});

export const SimulateMealRow = z.object({
  itemId: z.string(),
  name: z.string(),
  required: z.number(),
  unit: z.string(),
  available: z.number(),
  status: z.enum(["AVAILABLE", "LOW", "MISSING", "EXPIRING"]),
  shortfall: z.number().optional(),
});

export const SimulateMealResponse = z.object({
  recipeId: z.string(),
  recipeName: z.string(),
  servings: z.number(),
  rows: z.array(SimulateMealRow),
});

export type SimulateMealRequest = z.infer<typeof SimulateMealRequest>;

// ============================================================================
// 12. Obligation Ingestion Pipeline (TRD §12 — documents, bills,
// appointments, vehicle service, subscriptions)
// ============================================================================

export const ObligationIngestKindSchema = z.enum([
  "document",
  "bill",
  "appointment",
  "vehicle_service",
  "subscription",
]);
export type ObligationIngestKind = z.infer<typeof ObligationIngestKindSchema>;

export const ObligationIngestInputSchema = z.object({
  householdId: z.string().optional(),
  /** Structured input — either `kind`+fields or free-form `rawText` to parse. */
  kind: ObligationIngestKindSchema.optional(),
  title: z.string().optional(),
  provider: z.string().optional(),
  detail: z.string().optional(),
  /** ISO date (YYYY-MM-DD) or full ISO timestamp. */
  dueDate: z.string().optional(),
  amountInr: z.number().nonnegative().optional(),
  recurrence: z
    .enum(["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"])
    .optional(),
  /** Free-form statement/utterance parsed by OpenAI with a deterministic fallback. */
  rawText: z.string().optional(),
  source: z.enum(["manual", "voice", "document", "statement"]).optional(),
  idempotencyKey: z.string().optional(),
});
export type ObligationIngestInput = z.infer<typeof ObligationIngestInputSchema>;

export const ParsedObligationSchema = z.object({
  kind: ObligationIngestKindSchema,
  title: z.string(),
  provider: z.string().optional(),
  detail: z.string().optional(),
  dueDate: z.string().optional(),
  amountInr: z.number().nonnegative().optional(),
  recurrence: z
    .enum(["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"])
    .optional(),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  usedProvider: z.enum(["openai", "deterministic"]),
});
export type ParsedObligation = z.infer<typeof ParsedObligationSchema>;
export type SimulateMealResponse = z.infer<typeof SimulateMealResponse>;

// ============================================================================
// 13. State Diffs, Counterfactual State Simulation & Physical Verification
// ============================================================================

export const StateTransitionSchema = z.object({
  entityType: z.enum([
    "resource",
    "meal_plan",
    "obligation",
    "action",
    "expectation",
  ]),
  entityId: z.string(),
  entityLabel: z.string(),
  field: z.string(),
  before: z.union([z.number(), z.string(), z.null()]),
  after: z.union([z.number(), z.string(), z.null()]),
  deltaDisplay: z.string().optional(),
});
export type StateTransition = z.infer<typeof StateTransitionSchema>;

export const ExpectationStatusSchema = z.enum([
  "AWAITING_DELIVERY",
  "VERIFIED_MATCH",
  "DISCREPANCY_DETECTED",
]);
export type ExpectationStatus = z.infer<typeof ExpectationStatusSchema>;

export const ExpectationRecordSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  actionId: z.string(),
  resourceId: z.string(),
  resourceName: z.string(),
  vendorName: z.string(),
  expectedQty: z.number().nonnegative(),
  verifiedQty: z.number().nonnegative().nullable(),
  discrepancyQty: z.number().nonnegative(),
  baseUnit: BaseUnitSchema,
  displayUnit: DisplayUnitSchema,
  expectedDisplay: z.string(),
  verifiedDisplay: z.string().nullable(),
  discrepancyDisplay: z.string().nullable(),
  status: ExpectationStatusSchema,
  createdAt: z.string(),
  verifiedAt: z.string().nullable(),
});
export type ExpectationRecord = z.infer<typeof ExpectationRecordSchema>;

export const VerifyDeliveryInputSchema = z.object({
  householdId: z.string().default("hh_demo_001"),
  actionId: z.string(),
  mode: z.enum(["EXACT_MATCH", "SHORT_DELIVERY", "CUSTOM"]).default("EXACT_MATCH"),
  items: z
    .array(
      z.object({
        resourceId: z.string(),
        actualDeliveredBaseQty: z.number().nonnegative(),
      })
    )
    .optional(),
});
export type VerifyDeliveryInput = z.infer<typeof VerifyDeliveryInputSchema>;

export const CounterfactualSimulationInputSchema = z.object({
  householdId: z.string().default("hh_demo_001"),
  recipeId: z.string().default("rcp_chicken_biryani"),
  servings: z.number().int().positive().max(50).default(10),
  baselineServings: z.number().int().positive().max(50).default(6),
  plannedDate: z.string().optional(),
  mealSlot: z.enum(["breakfast", "lunch", "dinner"]).default("dinner"),
});
export type CounterfactualSimulationInput = z.infer<
  typeof CounterfactualSimulationInputSchema
>;

export const CounterfactualIngredientDeltaSchema = z.object({
  resourceId: z.string(),
  name: z.string(),
  baselineRequiredDisplay: z.string(),
  simulatedRequiredDisplay: z.string(),
  availableDisplay: z.string(),
  baselineDeficitDisplay: z.string(),
  simulatedDeficitDisplay: z.string(),
  deltaRequiredBaseQty: z.number(),
  deltaDeficitBaseQty: z.number(),
  deltaDisplay: z.string(),
  additionalCostInr: z.number().nonnegative(),
  statusBefore: IngredientStatusSchema,
  statusAfter: IngredientStatusSchema,
  newlyShort: z.boolean(),
});
export type CounterfactualIngredientDelta = z.infer<
  typeof CounterfactualIngredientDeltaSchema
>;

export const CounterfactualSimulationResultSchema = z.object({
  householdId: z.string(),
  stateVersion: z.number().int(),
  recipeId: z.string(),
  recipeName: z.string(),
  baselineServings: z.number().int(),
  simulatedServings: z.number().int(),
  baselineShortageCount: z.number().int(),
  simulatedShortageCount: z.number().int(),
  baselineOrderCostInr: z.number().nonnegative(),
  simulatedOrderCostInr: z.number().nonnegative(),
  deltaCostInr: z.number(),
  additionalActionsCount: z.number().int().nonnegative(),
  competingMealsAffected: z.array(
    z.object({
      mealTitle: z.string(),
      resourceName: z.string(),
      impactSummary: z.string(),
    })
  ),
  ingredientDeltas: z.array(CounterfactualIngredientDeltaSchema),
  stateDiffs: z.array(StateTransitionSchema),
  simulatedRippleGraph: RippleGraphSchema,
});
export type CounterfactualSimulationResult = z.infer<
  typeof CounterfactualSimulationResultSchema
>;


// ============================================================================
// LIVORA AI: life intelligence, mobility, circular living, notifications
// ============================================================================

export const LifeDecisionInputSchema = z.object({
  suggestionId: z.string().min(1).max(120),
  kind: z.string().min(1).max(60),
  decision: z.enum(["accepted", "rejected"]),
});
export type LifeDecisionInput = z.infer<typeof LifeDecisionInputSchema>;

export const AssistantAskInputSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ q: z.string().max(500), a: z.string().max(1500) }))
    .max(6)
    .optional(),
  /** Optional photo (receipt, bill, outfit, pantry shelf) as a resized data URL. */
  image: z
    .string()
    .max(3_000_000)
    .regex(/^data:image\/(png|jpe?g|webp);base64,/)
    .optional(),
});
export type AssistantAskInput = z.infer<typeof AssistantAskInputSchema>;

// ── Cart ────────────────────────────────────────────────────────────────────

export const CartItemSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  name: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  /** Line total in ₹ for this quantity. 0 with priceUnknown when no price is on record. */
  estimatedPrice: z.number().nonnegative(),
  priceUnknown: z.boolean().optional(),
  source: z.enum(["auto", "manual", "recipe", "assistant"]),
  reason: z.string().optional(),
  platform: z.enum(["zepto", "blinkit", "manual"]).optional(),
  addedAt: z.string().optional(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const CartAddInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.number().positive().max(1000).default(1),
  unit: z.string().trim().min(1).max(20).default("pc"),
  source: z.enum(["manual", "assistant"]).default("manual"),
});
export type CartAddInput = z.infer<typeof CartAddInputSchema>;

export const CartUpdateInputSchema = z.object({
  quantity: z.number().min(0).max(1000),
});
export type CartUpdateInput = z.infer<typeof CartUpdateInputSchema>;

/** A state change the assistant carried out on the user's behalf. */
export const AssistantActionSchema = z.object({
  type: z.enum(["cart_add", "cart_remove"]),
  status: z.enum(["done", "skipped"]),
  itemId: z.string().optional(),
  name: z.string(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  /** Quantity before this action (0 = the item was not in the cart); used for undo. */
  previousQuantity: z.number().optional(),
  note: z.string().optional(),
});
export type AssistantAction = z.infer<typeof AssistantActionSchema>;

export const FlagInputSchema = z.object({ enabled: z.boolean() });
export type FlagInput = z.infer<typeof FlagInputSchema>;

export const NotificationsReadInputSchema = z.object({
  ids: z.union([z.array(z.string().max(60)).max(200), z.literal("all")]),
});
export type NotificationsReadInput = z.infer<typeof NotificationsReadInputSchema>;

export const WardrobeAddInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(["Ethnic", "Formal", "Casual", "Accessory"]),
  occasion: z.string().trim().min(1).max(30),
});
export type WardrobeAddInput = z.infer<typeof WardrobeAddInputSchema>;

export const ListingAddInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  type: z.enum(["rent", "lend", "exchange"]),
  perDay: z.number().min(0).max(100000).default(0),
});
export type ListingAddInput = z.infer<typeof ListingAddInputSchema>;

export const ImpactFactorsInputSchema = z.object({
  garment: z.number().min(0).max(20),
  household: z.number().min(0).max(20),
});
export type ImpactFactorsInput = z.infer<typeof ImpactFactorsInputSchema>;
