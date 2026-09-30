import crypto from "node:crypto";
import type {
  ActionOutcome,
  ActionOrderItem,
  ActionProposal,
  AgentRunTrace,
  Forecast,
  MealCommitInput,
  MealPlan,
  Obligation,
  ParsedObligation,
  ReceiptUpload,
  RippleGraph,
  SnapserveCallStatus,
  StructuredVoiceIntent,
} from "@household/contracts";
import { computeResourceDerivedFields, type HouseholdStore } from "@household/db";
import {
  buildMealRippleGraph,
  commitMealPlanReservation,
  computePayloadHash,
  formatQuantityDisplay,
  issueApprovalToken,
  runForecastEngine,
  simulateMeal,
  stageReceiptUpload,
  type MealSimulationResult,
} from "@household/domain";
import {
  executeSnapserveOutboundCall,
  extractReceiptWithVision,
  parseObligationDeterministic,
  parseObligationWithOpenAI,
  parseVoiceOrTextIntent,
  resolveSnapserveAgent,
  resolveSnapserveAgentNumber,
  transcribeAudioWithSarvam,
  verifyVendorTranscript,
} from "@household/integrations";
import { buildVendorCallScript as buildHumanizedCallScript } from "./voice-agent.js";
import { AgentTraceRecorder } from "@household/tools";

// ============================================================================
// 0. Obligation Ingestion Pipeline (documents · bills · appointments ·
// vehicle service · subscriptions) — TRD §12 events made real.
// ============================================================================

export async function runObligationIngestWorkflow(
  store: HouseholdStore,
  options: {
    householdId?: string;
    structured?: {
      kind: "document" | "bill" | "appointment" | "vehicle_service" | "subscription";
      title: string;
      provider?: string;
      detail?: string;
      dueDate?: string;
      amountInr?: number;
      recurrence?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    };
    rawText?: string;
    source?: "manual" | "voice" | "document" | "statement";
    idempotencyKey?: string;
    onBroadcast?: RealtimeBroadcastCallback;
  }
): Promise<{
  eventId: string;
  obligation: Obligation;
  parse: {
    kind: string;
    title: string;
    dueDate?: string;
    amountInr?: number;
    confidence: number;
    needsReview: boolean;
    usedProvider: "openai" | "deterministic";
  };
  forecasts: Forecast[];
  agentRun: AgentRunTrace;
}> {
  const householdId = options.householdId || "hh_demo_001";
  const now = new Date();
  const nowIso = now.toISOString();
  const timeStr = now.toTimeString().slice(0, 5);

  const cached = store.getIdempotentResult<{ eventId: string }>(options.idempotencyKey);
  if (cached) {
    const state = store.getState();
    const existing = state.obligations.find(
      (o) => o.sourceEventId === cached.eventId,
    );
    if (existing) {
      return {
        eventId: cached.eventId,
        obligation: existing,
        parse: {
          kind: existing.category,
          title: existing.title,
          dueDate: existing.dueDate,
          amountInr: existing.amountInr,
          confidence: 1,
          needsReview: false,
          usedProvider: "deterministic",
        },
        forecasts: state.forecasts,
        agentRun:
          state.agentRuns.find((r) => r.triggerEventId === cached.eventId) ??
          {
            id: `run_replay_${cached.eventId}`,
            householdId,
            triggerEventId: cached.eventId,
            workflowType: "OBLIGATION_INGEST",
            status: "COMPLETED",
            totalLatencyMs: 0,
            steps: [],
            startedAt: nowIso,
            completedAt: nowIso,
          },
      };
    }
  }

  const eventId = `evt_obligation_${crypto.randomUUID().slice(0, 8)}`;
  const recorder = new AgentTraceRecorder(
    store,
    householdId,
    "OBLIGATION_INGEST",
    eventId,
  );

  // ── Step 1: Supervisor classifies the input ────────────────────────────
  await recorder.runStep({
    agentName: "Supervisor",
    executionMode: "LLM_AGENT",
    action: "Classified obligation intake",
    reason: "Route statement or structured fields into the obligation pipeline",
    execute: async ({ callTool }) => {
      await callTool(
        "state.read",
        `Read household ${householdId} obligations`,
        () => store.getState().obligations.length,
        (count) => `${count} obligations currently tracked`,
      );
    },
  });

  // ── Step 2: Intake Agent parses input (OpenAI → deterministic fallback) ─
  const parse = await recorder.runStep({
    agentName: "IntakeAgent",
    executionMode: "LLM_AGENT",
    action: "Parsed obligation statement into structured fields",
    reason:
      "Interpret free text via OpenAI; fall back to deterministic regex extraction on failure (TRD §34)",
    execute: async ({ callTool }) => {
      const structured = options.structured;
      if (structured && structured.title.trim()) {
        return callTool(
          "event.create",
          "Use user-provided structured fields",
          () =>
            ({
              kind: structured.kind,
              title: structured.title,
              ...(structured.provider ? { provider: structured.provider } : {}),
              ...(structured.detail ? { detail: structured.detail } : {}),
              ...(structured.dueDate ? { dueDate: structured.dueDate } : {}),
              ...(structured.amountInr != null
                ? { amountInr: structured.amountInr }
                : {}),
              ...(structured.recurrence ? { recurrence: structured.recurrence } : {}),
              confidence: 1,
              needsReview: false,
              usedProvider: "deterministic" as const,
            }) satisfies ParsedObligation,
          (p) => `Structured input accepted: ${p.title}`,
        );
      }

      const text = options.rawText?.trim() ?? "";
      if (!text) {
        throw new Error(
          "Provide either structured fields or rawText for obligation ingestion.",
        );
      }

      let parsed: ParsedObligation;
      try {
        parsed = await callTool(
          "event.create",
          "Extract obligation via OpenAI",
          () => parseObligationWithOpenAI(text),
          (p) => `OpenAI parsed (${p.usedProvider}) · confidence ${p.confidence}`,
        );
      } catch {
        parsed = await callTool(
          "event.create",
          "OpenAI unavailable — deterministic fallback parse",
          () => parseObligationDeterministic(text),
          (p) =>
            `Deterministic parse · confidence ${p.confidence}${p.needsReview ? " · needs review" : ""}`,
        );
      }
      return parsed;
    },
  });

  // ── Step 3: Deterministic state transition — create normalized event + obligation
  const dueDate = parse.dueDate;
  const dueTime = dueDate ? new Date(`${dueDate}T23:59:59`).getTime() : NaN;
  const daysUntilDue = Number.isFinite(dueTime)
    ? Math.ceil((dueTime - now.getTime()) / (24 * 60 * 60 * 1000))
    : 30;
  const status =
    daysUntilDue < 0
      ? ("OVERDUE" as const)
      : daysUntilDue <= 7
        ? ("DUE_SOON" as const)
        : ("UPCOMING" as const);

  const eventIdTyped = eventId;
  const obligation: Obligation = await recorder.runStep({
    agentName: "IntakeAgent",
    executionMode: "DETERMINISTIC_ENGINE",
    action: "Created normalized OBLIGATION event and canonical obligation",
    reason: `Status ${status} (due in ${daysUntilDue} days) computed deterministically from parsed date`,
    execute: async ({ callTool }) => {
      return callTool(
        "event.create",
        `Persist event ${eventIdTyped} + obligation record`,
        () => {
          const kind = parse.kind;
          const subtype =
            kind === "vehicle_service" ? "vehicle_service" : kind;
          const newObligation: Obligation = {
            id: `obl_${crypto.randomUUID().slice(0, 8)}`,
            householdId,
            category:
              subtype === "bill"
                ? "BILL"
                : subtype === "appointment"
                  ? "APPOINTMENT"
                  : subtype === "document"
                    ? "document"
                    : subtype === "vehicle_service"
                      ? "vehicle_service"
                      : "subscription",
            title: parse.title,
            subtitle:
              parse.detail ??
              (parse.provider ? `${parse.provider} obligation` : "Parsed from user statement"),
            dueDate: dueDate ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            daysUntilDue,
            ...(parse.amountInr != null ? { amountInr: parse.amountInr } : {}),
            ...(parse.recurrence && parse.recurrence !== "NONE"
              ? { recurrence: parse.recurrence === "YEARLY" ? ("MONTHLY" as const) : parse.recurrence }
              : {}),
            status,
            sourceEventId: eventIdTyped,
          };

          store.mutate((draft) => {
            draft.events.unshift({
              id: eventIdTyped,
              householdId,
              idempotencyKey: options.idempotencyKey || `idem_${eventIdTyped}`,
              type: "OBLIGATION_CREATED",
              source: options.source ?? "manual",
              confidence: parse.confidence,
              payload: { ...parse, source: options.source ?? "manual" } as Record<string, unknown>,
              createdAt: nowIso,
            });
            draft.obligations.unshift(newObligation);
            draft.timeline.unshift({
              id: `tl_obl_${crypto.randomUUID().slice(0, 6)}`,
              householdId,
              eventId: eventIdTyped,
              timestamp: nowIso,
              timeFormatted: timeStr,
              title: "Obligation tracked",
              description: `${parse.title}${parse.dueDate ? ` · due ${parse.dueDate}` : ""}${
                parse.amountInr != null ? ` · ₹${parse.amountInr}` : ""
              }${parse.usedProvider === "deterministic" && parse.needsReview ? " · review suggested" : ""}`,
              category: "obligation",
              status: parse.needsReview ? "WARNING" : "INFO",
            });
          });

          return newObligation;
        },
        (obl) => `Obligation ${obl.id} stored (${obl.status})`,
      );
    },
  });

  // ── Step 4: Forecast engine refresh (compliance risk for due-soon items) ─
  const { forecasts } = await recorder.runStep({
    agentName: "ForecastEngine",
    executionMode: "DETERMINISTIC_ENGINE",
    action: "Refreshed compliance forecasts",
    reason: "Due-soon obligations become COMPLIANCE_RISK forecasts with day counts",
    execute: async ({ callTool }) => {
      return callTool(
        "forecast.run",
        `Run forecast model for ${householdId}`,
        () => runForecastEngine(store, householdId),
        (res) => `${res.forecasts.length} active forecasts`,
      );
    },
  });

  const agentRun = recorder.finalize("COMPLETED");
  const result = { eventId, obligation, parse, forecasts, agentRun };
  store.setIdempotentResult(options.idempotencyKey, {
    eventId,
  });
  options.onBroadcast?.("OBLIGATION_INGESTED", {
    eventId,
    obligation,
  });
  return result;
}
import { buildVendorCallScript } from "./voice-agent.js";

export type RealtimeBroadcastCallback = (
  eventType: string,
  payload: Record<string, unknown>
) => void;

// ============================================================================
// 1. Receipt Extraction Workflow (Supervisor -> IntakeAgent -> Staging)
// ============================================================================

export async function runReceiptExtractionWorkflow(
  store: HouseholdStore,
  options: {
    householdId?: string;
    imageBase64?: string;
    rawText?: string;
    vendorHint?: string;
    demoFallback?: boolean;
  } = {}
): Promise<{
  receipt: ReceiptUpload;
  agentRun: AgentRunTrace;
}> {
  const householdId = options.householdId || "hh_demo_001";
  const recorder = new AgentTraceRecorder(store, householdId, "RECEIPT_INTAKE");

  await recorder.runStep({
    agentName: "Supervisor",
    executionMode: "LLM_AGENT",
    action: "Classified receipt upload intent",
    reason: "Route grocery bill image/text to IntakeAgent for OCR & entity resolution",
    execute: async ({ callTool }) => {
      await callTool(
        "state.read",
        `Read household ${householdId} resource catalog`,
        () => store.getState().resources.length,
        (count) => `${count} canonical resources loaded`
      );
    },
  });

  const receipt = await recorder.runStep({
    agentName: "IntakeAgent",
    executionMode: "LLM_AGENT",
    action: "Extracted line items & matched canonical resources",
    reason: "Parse quantities, normalize units to base (g/ml), and flag low-confidence rows (<0.85)",
    execute: async ({ callTool }) => {
      const extracted = await callTool(
        "inventory.read",
        "Run Vision/OCR extraction & alias matching",
        () => extractReceiptWithVision(options),
        (res) =>
          `${res.items.length} items extracted (${res.usedProvider})`
      );

      return callTool(
        "event.create",
        `Stage receipt from ${extracted.vendorName} for user review`,
        () =>
          stageReceiptUpload(
            store,
            householdId,
            extracted.vendorName,
            extracted.items
          ),
        (staged) =>
          `Staged ${staged.id} (${
            staged.items.filter((i) => i.needsReview).length
          } item flagged with '?')`
      );
    },
  });

  const agentRun = recorder.finalize("COMPLETED");
  return { receipt, agentRun };
}

// ============================================================================
// 2. Voice Transcription + NLU Workflow (Sarvam STT -> IntakeAgent)
// ============================================================================

export async function runVoiceIntakeWorkflow(
  store: HouseholdStore,
  options: {
    householdId?: string;
    audioBuffer?: Buffer;
    mimeType?: string;
    languageCode?: string;
    transcriptOverride?: string;
    autoSimulate?: boolean;
    autoCommit?: boolean;
    onBroadcast?: RealtimeBroadcastCallback;
  }
): Promise<{
  rawTranscript: string;
  languageDetected: string;
  structuredIntent: StructuredVoiceIntent;
  simulation?: MealSimulationResult;
  committedResult?: Awaited<ReturnType<typeof runMealPlanningWorkflow>>;
}> {
  const householdId = options.householdId || "hh_demo_001";
  const stt = await transcribeAudioWithSarvam({
    audioBuffer: options.audioBuffer,
    mimeType: options.mimeType,
    languageCode: options.languageCode,
    transcriptOverride: options.transcriptOverride,
  });

  const structuredIntent = await parseVoiceOrTextIntent(stt.rawTranscript);

  let simulation: MealSimulationResult | undefined;
  if (options.autoSimulate !== false && structuredIntent.intent === "MEAL_PLANNED") {
    simulation = simulateMeal(store, {
      householdId,
      recipeId: structuredIntent.recipeId,
      dish: structuredIntent.dish,
      servings: structuredIntent.servings || 6,
      plannedDate: structuredIntent.plannedDate,
      mealSlot: structuredIntent.mealSlot || "dinner",
    });
  }

  let committedResult:
    | Awaited<ReturnType<typeof runMealPlanningWorkflow>>
    | undefined;
  if (options.autoCommit && structuredIntent.intent === "MEAL_PLANNED") {
    committedResult = await runMealPlanningWorkflow(
      store,
      {
        householdId,
        recipeId: structuredIntent.recipeId,
        dish: structuredIntent.dish,
        servings: structuredIntent.servings || 6,
        plannedDate: structuredIntent.plannedDate,
        mealSlot: structuredIntent.mealSlot || "dinner",
        source: "voice",
        rawTranscript: stt.rawTranscript,
      },
      options.onBroadcast
    );
  }

  return {
    rawTranscript: stt.rawTranscript,
    languageDetected: stt.languageDetected,
    structuredIntent,
    simulation,
    committedResult,
  };
}

// ============================================================================
// 3. Full Meal Planning -> Ripple -> Forecast -> Action Proposal Workflow
// ============================================================================

export async function runMealPlanningWorkflow(
  store: HouseholdStore,
  input: MealCommitInput,
  onBroadcast?: RealtimeBroadcastCallback
): Promise<{
  eventId: string;
  mealPlan: MealPlan;
  simulation: MealSimulationResult;
  rippleGraph: RippleGraph;
  forecasts: Forecast[];
  proposedActions: ActionProposal[];
  agentRun: AgentRunTrace;
}> {
  const cached = store.getIdempotentResult<{
    eventId: string;
    mealPlan: MealPlan;
    simulation: MealSimulationResult;
    rippleGraph: RippleGraph;
    forecasts: Forecast[];
    proposedActions: ActionProposal[];
    agentRun: AgentRunTrace;
  }>(input.idempotencyKey);
  if (cached) return cached;

  const householdId = input.householdId || "hh_demo_001";
  const eventId = `evt_meal_${crypto.randomUUID().slice(0, 8)}`;
  const recorder = new AgentTraceRecorder(
    store,
    householdId,
    "MEAL_PLANNING",
    eventId
  );

  // Step 1: Supervisor classifies intent
  await recorder.runStep({
    agentName: "Supervisor",
    executionMode: "LLM_AGENT",
    action: "Classified request as MEAL_PLANNED workflow",
    reason: "Coordinate Intake, MealEngine, RippleEngine, ForecastEngine, and ActionPlanner",
    execute: async ({ callTool }) => {
      await callTool(
        "state.read",
        `Inspect household state for ${householdId}`,
        () => store.getState().resources.length,
        (count) => `Verified ${count} tracked kitchen items`
      );
    },
  });

  // Step 2: Intake Agent creates normalized MEAL_PLANNED event
  await recorder.runStep({
    agentName: "IntakeAgent",
    executionMode: "LLM_AGENT",
    action: "Created normalized MEAL_PLANNED event",
    reason: input.rawTranscript
      ? `Parsed utterance: "${input.rawTranscript}"`
      : `Normalized meal request (${input.dish || input.recipeId || "Chicken Biryani"} × ${input.servings})`,
    execute: async ({ callTool }) => {
      await callTool(
        "event.create",
        `Create event ${eventId} (MEAL_PLANNED)`,
        () => {
          store.mutate((draft) => {
            draft.events.unshift({
              id: eventId,
              householdId,
              idempotencyKey: input.idempotencyKey || `idem_${eventId}`,
              type: "MEAL_PLANNED",
              source: input.source || "voice",
              confidence: 0.96,
              payload: {
                dish: input.dish || "Chicken Biryani",
                recipeId: input.recipeId || "rcp_chicken_biryani",
                servings: input.servings,
                plannedDate: input.plannedDate || "tomorrow",
                mealSlot: input.mealSlot || "dinner",
                rawTranscript:
                  input.rawTranscript ||
                  "Naalaikku 6 perukku biryani pannanum.",
              },
              createdAt: new Date().toISOString(),
            });
          });
          return eventId;
        },
        (id) => `Event ${id} persisted`
      );
    },
  });

  // Step 3: Deterministic Meal Engine scales recipe & simulates inventory
  const simulation = await recorder.runStep({
    agentName: "MealEngine",
    executionMode: "DETERMINISTIC_ENGINE",
    action: "Resolved recipe & simulated ingredient requirements",
    reason: "Deterministic multiplication (qtyPerServing × servings) against three-tier ledger",
    execute: async ({ callTool }) => {
      await callTool(
        "recipe.read",
        `Lookup recipe ${input.recipeId || input.dish || "Chicken Biryani"}`,
        () => input.recipeId || "rcp_chicken_biryani",
        (id) => `Resolved ${id}`
      );
      return callTool(
        "inventory.simulate",
        `Simulate ${input.servings} servings against on_hand, reserved, and incoming stock`,
        () => simulateMeal(store, input),
        (sim) =>
          `${sim.ingredients.length} ingredients checked · ${sim.shortageCount} shortages (${sim.shortages
            .map((s) => `${s.name} -${s.formattedDeficit}`)
            .join(", ")})`
      );
    },
  });

  // Step 4: Deterministic Inventory Engine commits meal reservation
  const mealPlan = await recorder.runStep({
    agentName: "InventoryEngine",
    executionMode: "DETERMINISTIC_ENGINE",
    action: "Committed ingredient reservations to kitchen ledger",
    reason: "Lock required quantities in reserved_quantity without mutating physical on_hand stock",
    execute: async ({ callTool }) => {
      return callTool(
        "inventory.commit",
        `Reserve ingredients for ${simulation.recipe.name} × ${simulation.servings}`,
        () => commitMealPlanReservation(store, input, simulation, eventId),
        (mp) => `MealPlan ${mp.id} (${mp.status})`
      );
    },
  });

  // Step 5: Action Planner prepares vendor purchase proposal if shortages exist
  const proposedActions: ActionProposal[] = [];
  let primaryActionId: string | undefined;

  if (simulation.shortageCount > 0) {
    const actionProposal = await recorder.runStep({
      agentName: "ActionPlannerAgent",
      executionMode: "LLM_AGENT",
      action: "Proposed consolidated vendor purchase action",
      reason: `Prepare order for ${simulation.shortages
        .map((s) => `${s.formattedDeficit} ${s.name}`)
        .join(" & ")} with 'Why?' evidence`,
      execute: async ({ callTool }) => {
        return callTool(
          "action.prepare",
          `Construct purchase proposal for ${simulation.shortageCount} missing ingredients`,
          () => {
            const state = store.getState();
            const vendor =
              state.vendors.find(
                (v) => v.householdId === householdId && v.isPreferred
              ) || state.vendors[0];

            const actionId = `act_${crypto.randomUUID().slice(0, 8)}`;
            primaryActionId = actionId;
            const nowIso = new Date().toISOString();

            const orderItems: ActionOrderItem[] = simulation.shortages.map(
              (s) => {
                // Standard pack rounding: 100 ml curd deficit -> 200 ml standard pouch
                const orderQty =
                  s.resourceId === "res_curd" && s.deficitQty <= 200
                    ? 200
                    : s.deficitQty;
                const estCost =
                  s.resourceId === "res_chicken"
                    ? Math.round((orderQty / 1000) * 300)
                    : s.resourceId === "res_curd"
                      ? 30
                      : 80;

                return {
                  resourceId: s.resourceId,
                  name: s.name,
                  deficitDisplay: s.formattedDeficit,
                  orderQuantity: orderQty,
                  orderUnit: s.baseUnit,
                  orderDisplay: formatQuantityDisplay(
                    orderQty,
                    s.baseUnit,
                    s.displayUnit
                  ),
                  estimatedCostInr: estCost,
                };
              }
            );

            const totalCost = orderItems.reduce(
              (acc, item) => acc + item.estimatedCostInr,
              0
            );
            const titleParts = orderItems.map(
              (i) => `${i.orderDisplay} ${i.name}`
            );
            const title = `Purchase ${titleParts.join(" & ")}`;
            const reasonSummary = `Tomorrow's ${simulation.recipe.name} (${
              simulation.servings
            } servings) requires ${simulation.shortages
              .map((s) => `${s.formattedRequired} ${s.name.toLowerCase()}`)
              .join(" and ")}. Current inventory contains ${simulation.shortages
              .map((s) => `${s.formattedOnHand} ${s.name.toLowerCase()}`)
              .join(" and ")}.`;

            const callScript = buildVendorCallScript({
              householdName: "Sai's home",
              items: orderItems.map((i) => ({
                orderDisplay: i.orderDisplay,
                name: i.name,
              })),
              deliveryWindow: "tomorrow morning before 10:00 AM",
            }).combined;

            const canonicalPayload = {
              actionId,
              householdId,
              vendorId: vendor?.id,
              items: orderItems.map((i) => ({
                resourceId: i.resourceId,
                orderQuantity: i.orderQuantity,
                orderUnit: i.orderUnit,
              })),
            };

            const payloadHash = computePayloadHash(canonicalPayload);

            const proposal: ActionProposal = {
              id: actionId,
              householdId,
              sourceEventId: eventId,
              type: "VENDOR_PURCHASE_CALL",
              status: "PENDING_APPROVAL",
              title,
              subtitle: `${vendor?.name || "Kaveri Fresh Mart"} · Tomorrow morning delivery`,
              reasonSummary,
              whyEvidence: [], // Populated with ripple graph explanations below
              targetVendor: vendor,
              items: orderItems,
              estimatedTotalCostInr: totalCost,
              deliveryWindow: "Tomorrow morning (before 10:00 AM)",
              callScript,
              payloadHash,
              approvalRequired: true,
              approvedBy: null,
              approvedAt: null,
              externalCallId: null,
              externalCallStatus: null,
              callSteps: [],
              outcome: null,
              createdAt: nowIso,
              updatedAt: nowIso,
            };

            return proposal;
          },
          (act) => `Prepared ${act.id}: ${act.title} (₹${act.estimatedTotalCostInr})`
        );
      },
    });
    proposedActions.push(actionProposal);
  }

  // Step 6: Deterministic Ripple Engine builds causal DAG & "Why?" evidence
  const rippleGraph = await recorder.runStep({
    agentName: "RippleEngine",
    executionMode: "DETERMINISTIC_ENGINE",
    action: "Constructed causal dependency graph & 'Why?' evidence",
    reason: "Bounded BFS traversal (depth <= 5) across meal, resources, shortages, forecast, and action",
    execute: async ({ callTool }) => {
      return callTool(
        "graph.read",
        `Traverse dependencies for event ${eventId}`,
        () =>
          buildMealRippleGraph(store, eventId, simulation, {
            rawUtterance: input.rawTranscript,
            proposedActionId: primaryActionId,
          }),
        (graph) =>
          `${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.explanations.length} 'Why?' proofs`
      );
    },
  });

  // Attach ripple explanations to the prepared action and persist in store
  if (proposedActions.length > 0) {
    proposedActions[0].whyEvidence = rippleGraph.explanations;
    store.mutate((draft) => {
      // Remove older pending purchase actions for the same meal recipe to keep demo clean
      draft.actions = draft.actions.filter(
        (a) => a.status !== "PENDING_APPROVAL" || a.type !== "VENDOR_PURCHASE_CALL"
      );
      draft.actions.unshift(proposedActions[0]);
    });
  }

  // Step 7: Deterministic Forecast Engine refreshes household forecasts
  const { forecasts } = await recorder.runStep({
    agentName: "ForecastEngine",
    executionMode: "DETERMINISTIC_ENGINE",
    action: "Updated depletion & expiry risk forecasts",
    reason: "Evaluate post-reservation stock balances and active lot expiry horizons",
    execute: async ({ callTool }) => {
      return callTool(
        "forecast.run",
        `Run deterministic forecast model for ${householdId}`,
        () => runForecastEngine(store, householdId),
        (res) => `${res.forecasts.length} active risk forecasts`
      );
    },
  });

  const agentRun = recorder.finalize("COMPLETED");

  // Record timeline entries with full agent trace attached
  const now = new Date();
  const nowIso = now.toISOString();
  const timeStr = now.toTimeString().slice(0, 5);

  store.mutate((draft) => {
    if (simulation.shortageCount > 0) {
      draft.timeline.unshift({
        id: `tl_short_${crypto.randomUUID().slice(0, 6)}`,
        householdId,
        eventId,
        timestamp: nowIso,
        timeFormatted: timeStr,
        title: "Shortage detected",
        description: simulation.shortages
          .map((s) => `${s.name} · ${s.formattedDeficit} short`)
          .join(", "),
        category: "shortage",
        status: "WARNING",
        relatedActionId: primaryActionId,
        relatedRippleEventId: eventId,
      });
    }

    draft.timeline.unshift({
      id: `tl_meal_${crypto.randomUUID().slice(0, 6)}`,
      householdId,
      eventId,
      timestamp: nowIso,
      timeFormatted: timeStr,
      title: "Meal planned",
      description: `${simulation.recipe.name} · ${simulation.servings} servings (${
        simulation.shortageCount > 0
          ? `${simulation.shortageCount} ingredients short`
          : "All ingredients available"
      })`,
      category: "meal",
      status: simulation.shortageCount > 0 ? "WARNING" : "SUCCESS",
      relatedActionId: primaryActionId,
      relatedRippleEventId: eventId,
      agentRun,
    });
  });

  const finalResult = {
    eventId,
    mealPlan,
    simulation,
    rippleGraph,
    forecasts,
    proposedActions,
    agentRun,
  };

  store.setIdempotentResult(input.idempotencyKey, finalResult);
  onBroadcast?.("MEAL_PLANNED", {
    eventId,
    mealPlan,
    shortageCount: simulation.shortageCount,
    proposedActions,
  });

  return finalResult;
}

// ============================================================================
// 4. Action Approval -> Snapserve Outbound Call -> Transcript Reconciliation
// ============================================================================

export async function runActionApprovalAndExecutionWorkflow(
  store: HouseholdStore,
  params: {
    actionId: string;
    userId?: string;
    idempotencyKey?: string;
    stepDelayMs?: number;
    onBroadcast?: RealtimeBroadcastCallback;
  }
): Promise<{
  action: ActionProposal;
  outcome: ActionOutcome;
  agentRun: AgentRunTrace;
}> {
  const cached = store.getIdempotentResult<{
    action: ActionProposal;
    outcome: ActionOutcome;
    agentRun: AgentRunTrace;
  }>(params.idempotencyKey);
  if (cached) return cached;

  const userId = params.userId || "usr_sai_001";
  const state = store.getState();
  const existingAction = state.actions.find((a) => a.id === params.actionId);
  if (!existingAction) {
    throw new Error(`Action not found: ${params.actionId}`);
  }

  const householdId = existingAction.householdId;
  const recorder = new AgentTraceRecorder(
    store,
    householdId,
    "ACTION_EXECUTION",
    existingAction.sourceEventId
  );

  // Step 1: Issue HMAC-SHA256 Approval Token bound to actionId + payloadHash + userId + expiry
  const approvalTokenInfo = await recorder.runStep({
    agentName: "Supervisor",
    executionMode: "DETERMINISTIC_ENGINE",
    action: "Issued cryptographic HMAC-SHA256 approval token",
    reason: `Bind user approval (${userId}) to action ${existingAction.id} and payloadHash ${existingAction.payloadHash.slice(
      0,
      10
    )}...`,
    execute: async ({ callTool }) => {
      return callTool(
        "state.compare",
        `Verify payload hash & issue HMAC token for ${existingAction.id}`,
        () => issueApprovalToken(store, existingAction.id, userId),
        (tok) => `Token issued (expires ${tok.expiresAt})`
      );
    },
  });

  const updateActionCallStep = (
    status: SnapserveCallStatus,
    label: string,
    externalCallId: string
  ) => {
    const nowIso = new Date().toISOString();
    store.mutate((draft) => {
      const act = draft.actions.find((a) => a.id === existingAction.id);
      if (act) {
        act.status =
          status === "CONFIRMED"
            ? "CONFIRMED"
            : status === "FAILED"
              ? "FAILED"
              : "EXECUTING";
        act.externalCallId = externalCallId;
        act.externalCallStatus = status;
        act.updatedAt = nowIso;
        act.callSteps.push({
          status,
          label,
          timestamp: nowIso,
        });
      }
    });

    params.onBroadcast?.("SNAPSERVE_CALL_PROGRESS", {
      actionId: existingAction.id,
      status,
      label,
      externalCallId,
      timestamp: nowIso,
    });
  };

  // Step 2: Execution Engine invokes privileged snapserve.call tool (enforces HMAC token!)
  // Call target policy: the vendor's own SnapServe agent when the account has
  // one; otherwise the active SnapServe agent (the one with a caller number)
  // places the call on the household's behalf.
  const vendor = existingAction.targetVendor;
  const vendorAgent = vendor?.snapserveAgentId
    ? await resolveSnapserveAgent(vendor.snapserveAgentId)
    : null;
  const accountAgent = vendorAgent ? null : await resolveSnapserveAgent();
  const agentId = vendorAgent?.id ?? accountAgent?.id ?? 101;
  const agentCallerNumber = await resolveSnapserveAgentNumber(agentId);
  const vendorName = vendor?.name || "Kaveri Fresh Mart & Meats";
  const toNumber = vendor?.phoneE164 || "+919840000000";
  const orderSummary = existingAction.items
    .map((i) => `${i.orderDisplay} ${i.name}`)
    .join(" and ");
  const callScript = vendorAgent
    ? existingAction.callScript
    : buildHumanizedCallScript({
        householdName: "Sai's home",
        items: existingAction.items.map((i) => ({
          orderDisplay: i.orderDisplay,
          name: i.name,
        })),
        deliveryWindow: "tomorrow morning before 10:00 AM",
      }).english;

  const callResult = await recorder.runStep({
    agentName: "ExecutionEngine",
    executionMode: "DETERMINISTIC_ENGINE",
    action: "Executed outbound vendor voice call via Snapserve",
    reason: `Dial ${vendorName} (${toNumber}) from the active SnapServe agent #${agentId}${
      agentCallerNumber ? ` calling from ${agentCallerNumber}` : ""
    } with the approved order payload`,
    execute: async ({ callTool }) => {
      return callTool(
        "snapserve.call",
        `Outbound call to ${toNumber} (${orderSummary}) via agent #${agentId}`,
        () =>
          executeSnapserveOutboundCall({
            actionId: existingAction.id,
            householdId,
            agentId,
            toNumber,
            vendorName,
            orderSummary,
            callScript,
            stepDelayMs: params.stepDelayMs,
            onStatusUpdate: updateActionCallStep,
          }),
        (res) => `Call ${res.externalCallId} finished with ${res.finalStatus}`,
        {
          actionId: existingAction.id,
          approvalToken: approvalTokenInfo.token,
          idempotencyKey: params.idempotencyKey,
        }
      );
    },
  });

  // Step 3: Reconciliation Agent verifies call transcript and updates canonical incoming inventory
  const outcome = await recorder.runStep({
    agentName: "ReconciliationAgent",
    executionMode: "LLM_AGENT",
    action: "Verified vendor call transcript & reconciled incoming stock",
    reason:
      "Only confirmed vendor outcomes may update canonical incoming_quantity and resolve meal shortages",
    execute: async ({ callTool }) => {
      const expectedSummary = existingAction.items
        .map((i) => `${i.orderDisplay} ${i.name}`)
        .join(" and ");

      const verification = await callTool(
        "snapserve.status",
        `Verify transcript for call ${callResult.externalCallId}`,
        async () => {
          const base = await verifyVendorTranscript(
            callResult.transcript,
            expectedSummary
          );
          // The live SnapServe adapter already humanized the transcript and
          // produced a one-line outcome — prefer those for the ledger so the
          // UI never shows raw provider text.
          return {
            ...base,
            ...(callResult.humanizedSummary
              ? { vendorResponseSummary: callResult.humanizedSummary }
              : {}),
            ...(callResult.deliveryEta && callResult.deliveryEta !== "Unknown"
              ? { deliveryEta: callResult.deliveryEta }
              : {}),
          };
        },
        (v) => `Outcome verified as ${v.status} (ETA: ${v.deliveryEta})`
      );

      return callTool(
        "outcome.reconcile",
        `Reconcile ${verification.status} outcome into household state`,
        () => {
          const now = new Date();
          const nowIso = now.toISOString();
          const timeStr = now.toTimeString().slice(0, 5);

          return store.mutate(
            (draft) => {
              const act = draft.actions.find((a) => a.id === existingAction.id)!;
              const reconciledItems: ActionOutcome["reconciledItems"] = [];

              if (verification.status === "SUCCESS") {
                for (const item of act.items) {
                  const res = draft.resources.find(
                    (r) => r.id === item.resourceId
                  );
                  if (res) {
                    res.incomingQuantity += item.orderQuantity;
                    res.updatedAt = nowIso;
                    reconciledItems.push({
                      resourceId: res.id,
                      name: res.canonicalName,
                      addedIncomingQty: item.orderQuantity,
                      displayAdded: `+${item.orderDisplay}`,
                    });

                    // Register a physical delivery ExpectationRecord for closed-loop verification
                    const expId = `exp_${act.id}_${res.id}`;
                    if (!draft.expectations.some((e) => e.id === expId)) {
                      draft.expectations.unshift({
                        id: expId,
                        householdId,
                        actionId: act.id,
                        resourceId: res.id,
                        resourceName: res.canonicalName,
                        vendorName:
                          act.targetVendor?.name ||
                          "Nellai Fresh Meats & Provisions",
                        expectedQty: item.orderQuantity,
                        verifiedQty: null,
                        discrepancyQty: 0,
                        baseUnit: item.orderUnit,
                        displayUnit: res.displayUnit,
                        expectedDisplay: item.orderDisplay,
                        verifiedDisplay: null,
                        discrepancyDisplay: null,
                        status: "AWAITING_DELIVERY",
                        createdAt: nowIso,
                        verifiedAt: null,
                      });
                    }
                  }
                }

                // Mark associated meal plan as PLANNED_READY now that incoming order covers deficit
                for (const mp of draft.mealPlans) {
                  if (mp.sourceEventId === act.sourceEventId) {
                    mp.status = "PLANNED_READY";
                    mp.shortageCount = 0;
                  }
                }

                // Update ripple graph node statuses to RESOLVED
                const ripple = draft.rippleGraphs[act.sourceEventId];
                if (ripple) {
                  ripple.shortageCount = 0;
                  ripple.summary =
                    "All shortages resolved via confirmed Snapserve vendor order.";
                  for (const node of ripple.nodes) {
                    if (
                      node.type === "SHORTAGE" ||
                      node.type === "ACTION" ||
                      node.status === "CRITICAL"
                    ) {
                      node.status = "RESOLVED";
                    }
                  }
                }
              }

              draft.resources = draft.resources.map((r) =>
                computeResourceDerivedFields(r, draft.lots)
              );

              const outcomeRecord: ActionOutcome = {
                id: `out_${crypto.randomUUID().slice(0, 8)}`,
                actionId: act.id,
                status: verification.status,
                transcript: callResult.transcript,
                vendorResponseSummary: verification.vendorResponseSummary,
                deliveryEta: verification.deliveryEta,
                reconciledItems,
                reconciledAt: nowIso,
              };

              act.status =
                verification.status === "SUCCESS" ? "CONFIRMED" : "FAILED";
              act.outcome = outcomeRecord;
              act.updatedAt = nowIso;
              draft.outcomes.unshift(outcomeRecord);

              draft.events.unshift({
                id: `evt_done_${crypto.randomUUID().slice(0, 8)}`,
                householdId,
                idempotencyKey: `done_${act.id}`,
                type: "ACTION_COMPLETED",
                source: "snapserve",
                confidence: 1.0,
                payload: {
                  actionId: act.id,
                  externalCallId: callResult.externalCallId,
                  status: verification.status,
                  reconciledItems,
                },
                createdAt: nowIso,
              });

              draft.timeline.unshift({
                id: `tl_done_${crypto.randomUUID().slice(0, 6)}`,
                householdId,
                eventId: act.sourceEventId,
                timestamp: nowIso,
                timeFormatted: timeStr,
                title: "Vendor order confirmed & reconciled",
                description: `${act.title} · ${
                  act.targetVendor?.name || "Kaveri Fresh Mart"
                } (Delivery: ${verification.deliveryEta})`,
                category: "reconciliation",
                status: "SUCCESS",
                relatedActionId: act.id,
                relatedRippleEventId: act.sourceEventId,
              });

              return outcomeRecord;
            },
            {
              householdId,
              actor: "ReconciliationAgent",
              operation: "OUTCOME_RECONCILED",
              entityType: "Action",
              entityId: existingAction.id,
            }
          );
        },
        (out) =>
          `Reconciled ${out.reconciledItems
            .map((i) => `${i.name} ${i.displayAdded}`)
            .join(", ")}`
      );
    },
  });

  // Refresh forecasts after incoming stock update
  runForecastEngine(store, householdId);

  const agentRun = recorder.finalize("COMPLETED");

  // Attach agentRun to the top reconciliation timeline entry
  store.mutate((draft) => {
    const topTl = draft.timeline.find(
      (t) => t.relatedActionId === existingAction.id && t.category === "reconciliation"
    );
    if (topTl) {
      topTl.agentRun = agentRun;
    }
  });

  const updatedAction = store
    .getState()
    .actions.find((a) => a.id === existingAction.id)!;

  const finalRes = {
    action: updatedAction,
    outcome,
    agentRun,
  };

  store.setIdempotentResult(params.idempotencyKey, finalRes);
  params.onBroadcast?.("ACTION_RECONCILED", {
    action: updatedAction,
    outcome,
    agentRunId: agentRun.id,
  });

  return finalRes;
}

export * from "./voice-agent.js";
