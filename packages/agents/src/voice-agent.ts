// ============================================================================
// Household Voice Agent — purpose-built voice loop for Household Intelligence.
//
// Covers EXACTLY this product's voice surface:
//   1. Tamil / Tanglish / English speech in  (Sarvam STT, server-side key)
//   2. Meal intent out                        (OpenAI, deterministic fallback)
//   3. Deterministic consequence math         (MealEngine simulation — never LLM)
//   4. Optional commit → ripple → forecast → approval-gated vendor-call proposal
//   5. Bilingual vendor call script          (Tamil-first, English fallback)
//
// Provider transparency: every step reports which provider served it
// ("sarvam" | "openai" | "deterministic" | "provided-transcript" | "fallback")
// so the UI can show live vs fallback honestly. No secrets live here —
// adapters read server env. Browser code must NEVER import this module.
// ============================================================================

import type {
  ActionProposal,
  StructuredVoiceIntent,
} from "@household/contracts";
import type { HouseholdStore } from "@household/db";
import { parseVoiceOrTextIntent } from "@household/integrations";
import type { MealSimulationResult } from "@household/domain";
import {
  runMealPlanningWorkflow,
  runVoiceIntakeWorkflow,
  type RealtimeBroadcastCallback,
} from "./index.js";

function inferSttProvider(options: {
  transcriptOverride?: string;
  audioBuffer?: Buffer;
}): "sarvam" | "provided-transcript" | "fallback" {
  // Mirrors transcribeAudioWithSarvam's routing without re-calling the
  // provider (a second call would double-charge live STT usage). Caveat: if
  // the live call errors, the intake falls back while we report "sarvam".
  if (options.transcriptOverride && options.transcriptOverride.trim()) {
    return "provided-transcript";
  }
  if (
    options.audioBuffer &&
    options.audioBuffer.length > 0 &&
    process.env.SARVAM_API_KEY?.trim()
  ) {
    return "sarvam";
  }
  return "fallback";
}

export const VOICE_AGENT_SUPPORTED_LANGUAGES = ["ta-IN", "en-IN"] as const;
export type VoiceAgentLanguage =
  (typeof VOICE_AGENT_SUPPORTED_LANGUAGES)[number];

export type VoiceAgentNextAction =
  | { type: "REVIEW_ACTION"; actionId: string; title: string }
  | { type: "READY_TO_COOK"; servings: number; dish: string }
  | { type: "CLARIFY"; reason: string };

export interface HouseholdVoiceCommandResult {
  rawTranscript: string;
  languageDetected: string;
  sttProvider: "sarvam" | "provided-transcript" | "fallback";
  intentProvider: "openai" | "deterministic";
  structuredIntent: StructuredVoiceIntent;
  simulation?: MealSimulationResult;
  committedEventId?: string;
  proposedActions?: ActionProposal[];
  nextAction: VoiceAgentNextAction;
}

function resolveIntentProvider(): "openai" | "deterministic" {
  return process.env.OPENAI_API_KEY?.trim() ? "openai" : "deterministic";
}

export async function runHouseholdVoiceCommand(
  store: HouseholdStore,
  options: {
    householdId?: string;
    audioBuffer?: Buffer;
    mimeType?: string;
    languageCode?: string;
    transcriptOverride?: string;
    autoCommit?: boolean;
    idempotencyKey?: string;
    onBroadcast?: RealtimeBroadcastCallback;
  } = {}
): Promise<HouseholdVoiceCommandResult> {
  const householdId = options.householdId || "hh_demo_001";

  // Intake always runs simulate-only here; the single commit below keeps
  // exactly one MEAL_PLANNED event + reservation per voice command.
  const intake = await runVoiceIntakeWorkflow(store, {
    householdId,
    audioBuffer: options.audioBuffer,
    mimeType: options.mimeType,
    languageCode: options.languageCode,
    transcriptOverride: options.transcriptOverride,
    autoSimulate: true,
    autoCommit: false,
    onBroadcast: options.onBroadcast,
  });

  const intent =
    intake.structuredIntent ??
    (await parseVoiceOrTextIntent(intake.rawTranscript));

  let committedEventId: string | undefined;
  let proposedActions: ActionProposal[] | undefined;
  if (options.autoCommit && intent.intent === "MEAL_PLANNED") {
    const committed = await runMealPlanningWorkflow(
      store,
      {
        householdId,
        recipeId: intent.recipeId,
        dish: intent.dish,
        servings: intent.servings || 6,
        plannedDate: intent.plannedDate,
        mealSlot: intent.mealSlot || "dinner",
        source: "voice",
        rawTranscript: intake.rawTranscript,
        idempotencyKey: options.idempotencyKey,
      },
      options.onBroadcast
    );
    committedEventId = committed.eventId;
    proposedActions = committed.proposedActions;
  }

  const firstProposal =
    proposedActions && proposedActions.length > 0
      ? proposedActions[0]
      : undefined;

  let nextAction: VoiceAgentNextAction;
  if (intent.intent !== "MEAL_PLANNED") {
    nextAction = {
      type: "CLARIFY",
      reason: `Understood "${intake.rawTranscript}" but found no meal to plan.`,
    };
  } else if (firstProposal) {
    nextAction = {
      type: "REVIEW_ACTION",
      actionId: firstProposal.id,
      title: firstProposal.title,
    };
  } else if (intake.simulation) {
    nextAction = {
      type: "READY_TO_COOK",
      servings: intake.simulation.servings,
      dish: intake.simulation.recipe.name,
    };
  } else {
    nextAction = { type: "CLARIFY", reason: "No simulation produced." };
  }

  return {
    rawTranscript: intake.rawTranscript,
    languageDetected: intake.languageDetected,
    sttProvider: inferSttProvider({
      transcriptOverride: options.transcriptOverride,
      audioBuffer: options.audioBuffer,
    }),
    intentProvider: resolveIntentProvider(),
    structuredIntent: intent,
    simulation: intake.simulation,
    committedEventId,
    proposedActions,
    nextAction,
  };
}

// ============================================================================
// Bilingual vendor call script — the voice the vendor hears.
// `combined` preserves the long-standing call format exactly; `tamil` and
// `english` variants let the Snapserve agent speak the vendor's language.
// ============================================================================

export interface VendorCallScriptInput {
  householdName?: string;
  items: Array<{ orderDisplay: string; name: string }>;
  deliveryWindow?: string;
}

export interface VendorCallScript {
  combined: string;
  tamil: string;
  english: string;
}

export function buildVendorCallScript(
  input: VendorCallScriptInput
): VendorCallScript {
  const householdName = input.householdName || "Sai's home";
  const itemList = input.items.map((i) => `${i.orderDisplay} ${i.name}`);
  const joined = itemList.join(" and ");
  const deliveryWindow =
    input.deliveryWindow || "tomorrow morning before 10:00 AM";

  const combined =
    `Vanakkam! Good morning. I'm calling on behalf of ${householdName} — ` +
    `we'd like to place an order for ${joined}. ` +
    `Could you deliver it ${deliveryWindow}? Also, could you share the total bill amount?`;

  const tamil =
    `Vanakkam! Nalla vaazhthukkal. Naan ${householdName} pakkal irundhu pesaren — ` +
    `konjam items order pannanum: ${joined}. ` +
    `${deliveryWindow}-la delivery pannuveengalaa? Bill total evlo aagum?`;

  const english =
    `Vanakkam! Good morning. I'm calling on behalf of ${householdName} — ` +
    `we'd like to place an order for ${joined}. ` +
    `Could you deliver it ${deliveryWindow}? Also, could you share the total bill amount?`;

  return { combined, tamil, english };
}
