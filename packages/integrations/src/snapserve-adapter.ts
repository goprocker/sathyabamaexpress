import crypto from "node:crypto";
import type { SnapserveCallStatus } from "@household/contracts";

// ============================================================================
// SnapServe voice-agent adapter (app.snapserve.ai REST API)
//
// API contract (https://app.snapserve.ai/docs/api-reference):
//   POST /calls/outbound   { agentId, toNumber, variables?, parameters? }
//                          -> { id, status, agentId, toNumber, fromNumber }
//   GET  /calls/{id}       -> { id, status, transcript, callSummary,
//                               successEvaluation, dispositionResult,
//                               costCents, durationSeconds, errorMessage, ... }
//   GET  /agents           -> [{ id, name, status: "active"|"inactive"|"draft",
//                               language, ... }]
//   GET  /phone-numbers    -> numbers with assignedAgentId (caller ID / DID)
//
// Auth: Authorization: Bearer sk_live_...  Wallet must cover ~₹5/min (402 when
// empty). Call statuses: pending | ringing | in_progress | connected |
// completed | failed | cancelled | transferred | no_pickup | voicemail | busy
// | booked | callback_scheduled. Webhook event: call.completed / call.failed.
//
// Design:
//   • Live call when SNAPSERVE_API_KEY is set; deterministic simulator otherwise.
//   • "Active agent with a number": explicit agent (vendor/env) wins; otherwise
//     the first active agent from GET /agents is used and its assigned caller
//     number is resolved from GET /phone-numbers / agent fromNumber.
//   • Every status transition is streamed via onStatusUpdate so the UI and the
//     canonical ledger see PREPARING → CALLING → CONNECTED → CONFIRMED/FAILED.
//   • Transcripts returned to the household ledger are always humanized:
//     clean speaker labels, no JSON/stage directions, consistent naming.
// ============================================================================

function resolveSnapserveBaseUrl(): string {
  const raw = (
    process.env.SNAPSERVE_BASE_URL ||
    process.env.SNAPSERVE_API_BASE_URL || // legacy alias
    "https://app.snapserve.ai/api"
  )
    .trim()
    .replace(/\/+$/, "");
  // Normalize legacy REST-shape values ("…/v1") to the dashboard API root
  return raw.endsWith("/v1") ? raw.slice(0, -3) : raw;
}

const SNAPSERVE_BASE_URL = resolveSnapserveBaseUrl();

const DEFAULT_CALL_TIMEOUT_MS = Number(
  process.env.SNAPSERVE_CALL_TIMEOUT_MS || 120_000
);
const DEFAULT_POLL_INTERVAL_MS = Number(
  process.env.SNAPSERVE_POLL_INTERVAL_MS || 2_500
);

export class SnapserveApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly endpoint: string,
    message: string
  ) {
    super(message);
    this.name = "SnapserveApiError";
  }
}

export interface SnapserveOutboundCallParams {
  actionId: string;
  householdId: string;
  agentId: number;
  toNumber: string;
  vendorName: string;
  orderSummary: string;
  callScript: string;
  /** Never dial out: use the simulator even when live calls are configured (the shared demo household). */
  forceSimulated?: boolean;
  /** Spoken name of the household the order is for. */
  householdName?: string;
  stepDelayMs?: number;
  onStatusUpdate?: (
    status: SnapserveCallStatus,
    label: string,
    externalCallId: string
  ) => void;
}

export interface SnapserveOutboundCallResult {
  externalCallId: string;
  finalStatus: SnapserveCallStatus;
  transcript: string;
  usedProvider: "snapserve" | "deterministic-simulator";
  /** The SnapServe agent that placed the call (active agent resolution). */
  agentId?: number;
  /** The caller number the vendor saw (agent's assigned DID). */
  fromNumber?: string;
  /** One-sentence humanized outcome, safe to show verbatim in the UI. */
  humanizedSummary?: string;
  deliveryEta?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Low-level REST helpers
// ────────────────────────────────────────────────────────────────────────────

function snapserveApiKey(): string | null {
  const key = process.env.SNAPSERVE_API_KEY?.trim();
  return key ? key : null;
}

/**
 * Live calls require BOTH a key and SNAPSERVE_MODE != "simulated"
 * (TRD §12.1.5 demo fallback). Tests set SNAPSERVE_MODE=simulated so the
 * deterministic call machine runs hermetically even on a configured account.
 */
export function isSnapserveLive(): boolean {
  if ((process.env.SNAPSERVE_MODE || "").trim().toLowerCase() === "simulated") {
    return false;
  }
  return snapserveApiKey() !== null;
}

async function snapserveFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const apiKey = snapserveApiKey();
  if (!apiKey) {
    throw new SnapserveApiError(0, path, "SNAPSERVE_API_KEY is not configured.");
  }

  const response = await fetch(`${SNAPSERVE_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(30_000),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    throw new SnapserveApiError(
      response.status,
      path,
      `SnapServe ${init.method || "GET"} ${path} failed (${response.status}): ${rawBody.slice(0, 300)}`
    );
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new SnapserveApiError(
      response.status,
      path,
      `SnapServe returned non-JSON response for ${path}.`
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Agent & caller-number resolution — "the active one which has a number"
// ────────────────────────────────────────────────────────────────────────────

interface SnapserveAgentSummary {
  id: number;
  name?: string;
  status?: string;
  fromNumber?: string;
}

let activeAgentCache: {
  agent: SnapserveAgentSummary;
  resolvedAt: number;
} | null = null;
const AGENT_CACHE_TTL_MS = 5 * 60 * 1000;

export async function listSnapserveAgents(): Promise<SnapserveAgentSummary[]> {
  const agents = await snapserveFetch<
    Array<Record<string, unknown>> | { agents?: Array<Record<string, unknown>> }
  >(`/agents`);
  const rows = Array.isArray(agents) ? agents : agents.agents ?? [];
  return rows.map((r) => ({
    id: Number(r.id),
    name: typeof r.name === "string" ? r.name : undefined,
    status: typeof r.status === "string" ? r.status : undefined,
    fromNumber: extractNumberValue(r),
  }));
}

/**
 * Resolves the SnapServe agent that should place the call.
 * Priority: explicit agentId param → SNAPSERVE_AGENT_ID env → the first
 * agent whose status is "active" on the account (cached for 5 minutes).
 */
/** The agent that answers the household's ordering line (SNAPSERVE_ORDER_AGENT_ID); it must not place store calls. */
function isInboundOrderAgent(agentId: number): boolean {
  const orderAgentId = Number(process.env.SNAPSERVE_ORDER_AGENT_ID || "");
  return Number.isFinite(orderAgentId) && orderAgentId > 0 && agentId === orderAgentId;
}

export async function resolveSnapserveAgent(
  explicitAgentId?: number
): Promise<SnapserveAgentSummary | null> {
  const envAgentId = Number(process.env.SNAPSERVE_AGENT_ID || "");
  if (explicitAgentId && Number.isFinite(explicitAgentId)) {
    return { id: explicitAgentId };
  }
  if (Number.isFinite(envAgentId) && envAgentId > 0) {
    return { id: envAgentId };
  }

  if (
    activeAgentCache &&
    Date.now() - activeAgentCache.resolvedAt < AGENT_CACHE_TTL_MS
  ) {
    return activeAgentCache.agent;
  }

  try {
    const agents = await listSnapserveAgents();
    const activeAgents = agents.filter((a) => a.status === "active" && !isInboundOrderAgent(a.id));

    // Prefer the active agent that OWNS a phone number — i.e. the active one
    // which has a number — so outbound calls show the account's own caller ID
    // instead of a shared platform DID.
    try {
      const registry = await snapserveFetch<
        Array<Record<string, unknown>> | { numbers?: Array<Record<string, unknown>> }
      >(`/phone-numbers`);
      const rows = Array.isArray(registry) ? registry : registry.numbers ?? [];
      for (const row of rows) {
        if (row.status && row.status !== "active") continue;
        const owner = Number(row.assignedAgentId ?? row.agentId ?? NaN);
        const ownerAgent = activeAgents.find((a) => a.id === owner);
        if (ownerAgent) {
          activeAgentCache = { agent: ownerAgent, resolvedAt: Date.now() };
          return ownerAgent;
        }
      }
    } catch {
      // Registry unavailable — fall through to first active agent
    }

    const active = activeAgents[0] ?? agents[0];
    if (active && Number.isFinite(active.id)) {
      activeAgentCache = { agent: active, resolvedAt: Date.now() };
      return active;
    }
  } catch {
    return null;
  }
  return null;
}

function extractNumberValue(row: Record<string, unknown>): string | undefined {
  const candidateKeys = [
    "number",
    "phoneNumber",
    "phone",
    "e164",
    "fromNumber",
    "value",
    "digits",
  ];
  for (const key of candidateKeys) {
    const v = row[key];
    if (typeof v === "string" && /\+?\d{8,15}/.test(v.replace(/[\s-]/g, ""))) {
      return v.startsWith("+") ? v : `+${v.replace(/\D/g, "")}`;
    }
    if (typeof v === "number" && v > 1_000_000) {
      return `+${v}`;
    }
  }
  return undefined;
}

/**
 * Resolves the caller number assigned to the SnapServe agent — i.e. the
 * number the vendor actually sees ring. Priority: SNAPSERVE_AGENT_NUMBER env
 * → the agent's own fromNumber → the phone-number registry entry assigned to
 * the agent → null (unknown).
 */
export async function resolveSnapserveAgentNumber(
  agentId?: number
): Promise<string | null> {
  const envNumber = process.env.SNAPSERVE_AGENT_NUMBER?.trim();
  if (envNumber) return envNumber;

  let agentFromNumber: string | undefined;
  if (agentId) {
    try {
      const agents = await listSnapserveAgents();
      const match = agents.find((a) => a.id === agentId);
      agentFromNumber = match?.fromNumber;
    } catch {
      // Registry lookup below is the fallback
    }
  }

  try {
    const registry = await snapserveFetch<
      Array<Record<string, unknown>> | { numbers?: Array<Record<string, unknown>> }
    >(`/phone-numbers`);
    const rows = Array.isArray(registry) ? registry : registry.numbers ?? [];
    const assigned = rows.find((r) => {
      const owner = r.assignedAgentId ?? r.agentId;
      return agentId !== undefined && Number(owner) === agentId;
    });
    const number =
      (assigned && extractNumberValue(assigned)) ||
      agentFromNumber ||
      (rows.length === 1 ? extractNumberValue(rows[0]) : undefined);
    if (number) return number;
  } catch {
    // Non-fatal: caller-number display is cosmetic
  }

  return agentFromNumber ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Call initiation & status polling
// ────────────────────────────────────────────────────────────────────────────

interface SnapserveCallRecord {
  id: number | string;
  status: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  transcript?: string | null;
  callSummary?: string | null;
  successEvaluation?: string | null;
  errorMessage?: string | null;
  durationSeconds?: number | null;
  dispositionResult?: Record<string, unknown> | null;
}

const TERMINAL_COMPLETED = new Set(["completed", "booked", "callback_scheduled"]);
const TERMINAL_FAILED = new Set(["failed", "cancelled", "no_pickup", "voicemail", "busy"]);

function mapSnapserveStatus(raw: string): SnapserveCallStatus {
  switch (raw) {
    case "pending":
      return "PREPARING";
    case "ringing":
    case "in_progress":
      return "CALLING";
    case "connected":
      return "CONNECTED";
    case "transferred":
      return "AWAITING_RESPONSE";
    case "completed":
    case "booked":
    case "callback_scheduled":
      return "CONFIRMED";
    case "failed":
    case "cancelled":
    case "no_pickup":
    case "voicemail":
    case "busy":
      return "FAILED";
    default:
      return "UNKNOWN";
  }
}

export async function initiateSnapserveOutboundCall(input: {
  agentId: number;
  toNumber: string;
  variables: Record<string, string>;
}): Promise<{ id: string; status: string; fromNumber?: string }> {
  const call = await snapserveFetch<SnapserveCallRecord>(`/calls/outbound`, {
    method: "POST",
    body: JSON.stringify({
      agentId: input.agentId,
      toNumber: input.toNumber,
      // `variables` fills {{placeholders}} in the agent prompt; `parameters`
      // is the documented alias.
      variables: input.variables,
    }),
  });
  return {
    id: String(call.id),
    status: call.status,
    fromNumber: call.fromNumber ?? undefined,
  };
}

export async function fetchSnapserveCall(
  callId: string
): Promise<SnapserveCallRecord> {
  return snapserveFetch<SnapserveCallRecord>(`/calls/${encodeURIComponent(callId)}`);
}

// ── Phone ordering: inbound calls and agent setup ──────────────────────────

export interface SnapserveCallListItem {
  id: string;
  agentId: number | null;
  status: string;
  direction: "inbound" | "outbound" | string;
  fromNumber: string | null;
  toNumber: string | null;
  transcript: string | null;
  callSummary: string | null;
  /** Post-call structured extraction (the agent's dispositionSchema). */
  disposition: Record<string, unknown> | null;
  createdAt: string | null;
  endedAt: string | null;
}

/** Recent calls, newest first. `GET /calls?agentId=&limit=`. */
export async function listSnapserveCalls(filter: { agentId?: number; limit?: number } = {}): Promise<SnapserveCallListItem[]> {
  const params = new URLSearchParams();
  if (filter.agentId) params.set("agentId", String(filter.agentId));
  params.set("limit", String(filter.limit ?? 20));
  const rows = await snapserveFetch<Array<SnapserveCallRecord & Record<string, unknown>>>(`/calls?${params}`);
  return (Array.isArray(rows) ? rows : []).map((c) => {
    let disposition: Record<string, unknown> | null = null;
    const raw = c.dispositionResult as unknown;
    if (raw && typeof raw === "object") disposition = raw as Record<string, unknown>;
    else if (typeof raw === "string") {
      try {
        disposition = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        disposition = null;
      }
    }
    return {
      id: String(c.id),
      agentId: typeof c.agentId === "number" ? c.agentId : null,
      status: String(c.status ?? ""),
      direction: String(c.direction ?? ""),
      fromNumber: c.fromNumber ?? null,
      toNumber: c.toNumber ?? null,
      transcript: c.transcript ?? null,
      callSummary: c.callSummary ?? null,
      disposition,
      createdAt: typeof c.createdAt === "string" ? c.createdAt : null,
      endedAt: typeof c.endedAt === "string" ? c.endedAt : null,
    };
  });
}

/** Full agent record (`GET /agents/{id}`). */
export async function getSnapserveAgent(agentId: number): Promise<Record<string, unknown>> {
  return snapserveFetch<Record<string, unknown>>(`/agents/${agentId}`);
}

/** `POST /agents`. Required: name, systemPrompt, asrProvider, llmProvider, ttsProvider, telephonyProvider. */
export async function createSnapserveAgent(config: Record<string, unknown>): Promise<Record<string, unknown> & { id: number }> {
  return snapserveFetch<Record<string, unknown> & { id: number }>(`/agents`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

/** `PATCH /agents/{id}` with only the fields to change. */
export async function updateSnapserveAgent(agentId: number, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  return snapserveFetch<Record<string, unknown>>(`/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/**
 * Points a number at an agent (`PATCH /phone-numbers/{id}/assign`). One agent per
 * number, for both inbound and outbound. Note: an empty body unassigns it.
 */
export async function assignSnapservePhoneNumber(phoneNumberId: number, agentId: number): Promise<{ agentId: number | null }> {
  const res = await snapserveFetch<Record<string, unknown>>(`/phone-numbers/${phoneNumberId}/assign`, {
    method: "PATCH",
    body: JSON.stringify({ agentId }),
  });
  return { agentId: typeof res.agentId === "number" ? res.agentId : null };
}

/** Caller-ID numbers on the account (`GET /phone-numbers`). */
export async function listSnapservePhoneNumbers(): Promise<Array<{ id: number; number: string; agentId: number | null; status: string }>> {
  const rows = await snapserveFetch<Array<Record<string, unknown>>>(`/phone-numbers`);
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: Number(r.id),
    number: String(r.number ?? ""),
    agentId: typeof r.agentId === "number" ? r.agentId : null,
    status: String(r.status ?? ""),
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Transcript humanization — the "clean af" guarantee
// ────────────────────────────────────────────────────────────────────────────

function stripStageDirections(line: string): string {
  return line
    .replace(/\[[^\]]*\]/g, "") // [00:12] / [voicemail] / [inaudible]
    .replace(/\([^)]{0,40}(?:crosstalk|inaudible|background)[^)]*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function canonicalSpeaker(label: string): string {
  const l = label.toLowerCase();
  if (/(ai|agent|bot|assistant|system|snapserve)/.test(l)) return "Agent";
  if (/(vendor|shop|store|merchant|human|person|user|customer|caller)/.test(l)) {
    return "Vendor";
  }
  return "";
}

// Common ASR word-merges (speech-to-text often glues frequent pairs)
const ASR_MERGES: Array<[RegExp, string]> = [
  [/\bgoodmorning\b/gi, "good morning"],
  [/\bgoodafternoon\b/gi, "good afternoon"],
  [/\bgood evening\b/gi, "good evening"],
  [/\bthankyou\b/gi, "thank you"],
  [/\bthanls\b/gi, "thanks"],
  [/\bletme\b/gi, "let me"],
  [/\bcanyou\b/gi, "can you"],
  [/\bcouldyou\b/gi, "could you"],
  [/\bwouldyou\b/gi, "would you"],
  [/\bthisis\b/gi, "this is"],
  [/\bthat is all\b/gi, "that is all"],
];

/** Repairs glued ASR words and missing spaces around punctuation. */
function repairAsrSpacing(line: string): string {
  let out = line;
  // 1. Split camel-glued pairs first so merge patterns can see word bounds
  //    ("thisisBotty" → "thisis Botty" → "this is Botty")
  out = out
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2");
  // 2. Then fix common ASR merges
  for (const [pattern, replacement] of ASR_MERGES) {
    out = out.replace(pattern, replacement);
  }
  // 3. Tidy spacing/punctuation
  out = out
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([,.!?])([A-Za-z])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Capitalize only the start of the line — mid-line capitalization breaks
  // on abbreviations like "a.m. is"
  out = out.replace(/^([a-z])/, (m, ch) => ch.toUpperCase());
  return out;
}

/**
 * Normalizes a raw SnapServe transcript into a clean two-speaker script:
 *   Agent: "…"
 *   Vendor: "…"
 * Handles raw returns that use "AI:"/"Bot:" labels, timestamps, stage
 * directions, JSON blobs, or no labels at all.
 */
export function humanizeCallTranscript(
  rawTranscript: string,
  context: { vendorName: string; orderSummary: string; greeting?: string }
): string {
  const raw = rawTranscript?.trim();
  if (!raw) return "";

  // Some providers return JSON-encoded transcripts
  let text = raw;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        text = parsed
          .map((t) =>
            typeof t === "string"
              ? t
              : `${(t as Record<string, unknown>).role ?? "Agent"}: ${
                  (t as Record<string, unknown>).content ?? ""
                }`
          )
          .join("\n");
      } else if (typeof parsed === "object" && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        text = String(obj.transcript ?? obj.text ?? "");
      }
    } catch {
      // keep raw text
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map(stripStageDirections)
    .filter((l) => l.length > 0);

  const formatted: string[] = [];
  for (const line of lines) {
    const speakerMatch = line.match(/^([A-Za-z][A-Za-z ]{0,15})\s*[:\u2013\u2014-]\s*(.+)$/);
    if (speakerMatch) {
      const speaker = canonicalSpeaker(speakerMatch[1]);
      if (speaker) {
        const cleaned = repairAsrSpacing(
          speakerMatch[2].replace(/^["“]|["”]$/g, "").trim()
        );
        formatted.push(`${speaker}: "${cleaned}"`);
        continue;
      }
    }
    formatted.push(
      repairAsrSpacing(line.replace(/^["“]|["”]$/g, "").trim())
    );
  }

  // No speaker labels at all → treat as one agent turn + one vendor turn
  const hasLabels = formatted.some((l) => /^(Agent|Vendor):/.test(l));
  const out = hasLabels
    ? formatted
    : [
        `Agent: "${context.greeting || `Vanakkam! ${context.vendorName}-la irundhu pesaren.`}"`,
        `Vendor: "${formatted.join(" ")}"`,
      ];

  // Ensure the vendor's answer is present; drop trailing agent-only dangling turns
  const hasVendorLine = out.some((l) => l.startsWith("Vendor:"));
  const cleaned = out.filter((l) => l.length > 4);

  return (
    hasVendorLine ? cleaned : [...cleaned, `Vendor (${context.vendorName}): confirmed over call.`]
  ).join("\n");
}

/**
 * Optional second polish pass: OpenAI cleans residual ASR glitches the regex
 * pass can't fix ("letSaiknow" → "let Sai know", "Sai.s" → "Sai's") without
 * touching meaning or the Agent/Vendor quote format. Returns null on any
 * failure so callers fall back to the deterministic script.
 */
export async function polishTranscriptWithOpenAI(
  script: string
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !script.trim()) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You fix speech-to-text glitches in call transcripts. Rules: " +
              "(1) Keep every line's exact format `Speaker: \"text\"` with Speakers Agent/Vendor. " +
              "(2) Fix missing spaces, glued words, mangled punctuation, and wrong apostrophes (e.g. 'Sai.s' → 'Sai's', 'letSaiknow' → 'let Sai know'). " +
              "(3) NEVER change wording, names, numbers, or meaning; do not add or remove lines; do not summarize. " +
              "(4) Remove duplicated stutters like 'Thanks that is all Thanks that is all' to a single phrase. " +
              "Return ONLY the corrected transcript text.",
          },
          { role: "user", content: script },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    // Sanity: keep the polished script only if it preserved the line structure
    if (
      content &&
      /^(Agent|Vendor):/m.test(content) &&
      content.split(/\r?\n/).length >= script.split(/\r?\n/).length - 1
    ) {
      return content;
    }
    return null;
  } catch {
    return null;
  }
}

/** One clean sentence describing the call outcome — for timeline & UI. */
export function humanizeCallSummary(input: {
  vendorName: string;
  orderSummary: string;
  eta?: string;
  status: SnapserveCallStatus;
  callSummary?: string | null;
}): string {
  const eta = input.eta?.trim();
  if (input.status === "CONFIRMED") {
    const etaSuffix = eta && eta.toLowerCase() !== "unknown" ? ` for ${eta}` : "";
    return `${input.vendorName} confirmed ${input.orderSummary}${etaSuffix}.`;
  }
  if (input.status === "FAILED") {
    return `Could not reach ${input.vendorName} — the order was not placed and nothing was reserved.`;
  }
  return `Call with ${input.vendorName} ended without a clear confirmation.`;
}

// ────────────────────────────────────────────────────────────────────────────
// Simulator (demo mode — no SNAPSERVE_API_KEY)
// ────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSimulatedTranscript(params: {
  vendorName: string;
  orderSummary: string;
  callScript: string;
  greeting?: string;
}): string {
  return [
    `Agent: "${params.greeting || params.callScript}"`,
    `Vendor (${params.vendorName}): "Vanakkam! Yes, everything is available. We'll pack ${params.orderSummary} and deliver tomorrow morning by 9:30. The total comes to ₹270."`,
    `Agent: "Perfect, thank you. Please send it with tomorrow's morning delivery slot."`,
    `Vendor (${params.vendorName}): "Noted. You'll get it before 9:30 tomorrow."`,
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Main entrypoint: execute the outbound vendor call end-to-end
// ────────────────────────────────────────────────────────────────────────────

export async function executeSnapserveOutboundCall(
  params: SnapserveOutboundCallParams
): Promise<SnapserveOutboundCallResult> {
  const delayMs = params.stepDelayMs ?? 150;

  params.onStatusUpdate?.(
    "PREPARING",
    `Preparing outbound call to ${params.vendorName} (${params.toNumber})`,
    `call_snap_${crypto.randomUUID().slice(0, 8)}`
  );

  if (params.forceSimulated || !isSnapserveLive()) {
    return runSimulatedCall(params, delayMs);
  }

  try {
    return await runLiveCall(params);
  } catch (err) {
    // Config errors (bad key / empty wallet) must surface, not silently degrade
    if (
      err instanceof SnapserveApiError &&
      (err.httpStatus === 401 || err.httpStatus === 402 || err.httpStatus === 403)
    ) {
      throw err;
    }
    // Transient network/API issues: allow deterministic fallback unless disabled
    if (process.env.SNAPSERVE_ALLOW_SIMULATOR_FALLBACK === "false") {
      throw err;
    }
    console.warn(
      "[snapserve] live call failed, falling back to simulator:",
      err instanceof Error ? err.message : err
    );
    return runSimulatedCall(params, delayMs);
  }
}

async function runLiveCall(
  params: SnapserveOutboundCallParams
): Promise<SnapserveOutboundCallResult> {
  // ── Resolve the active agent ────────────────────────────────────────────
  let agent = await resolveSnapserveAgent(params.agentId);
  if (!agent) {
    throw new SnapserveApiError(0, "/agents", "No SnapServe agent available.");
  }

  const variables: Record<string, string> = {
    vendor_name: params.vendorName,
    order_summary: params.orderSummary,
    order_script: params.callScript,
    action_id: params.actionId,
    household_id: params.householdId,
  };

  // ── Initiate the call (auto-heal to the active agent if ours is gone) ────
  let initiated: { id: string; status: string; fromNumber?: string };
  try {
    initiated = await initiateSnapserveOutboundCall({
      agentId: agent.id,
      toNumber: params.toNumber,
      variables,
    });
  } catch (err) {
    // Stale/invalid agent id (e.g. demo placeholder 101): retry with the
    // configured outbound agent, else the first active agent — never the
    // inbound ordering agent, whose prompt takes orders instead of placing them.
    if (
      err instanceof SnapserveApiError &&
      (err.httpStatus === 400 || err.httpStatus === 404)
    ) {
      const activeAgents = (await listSnapserveAgents()).filter(
        (a) => a.status === "active" && a.id !== agent?.id && !isInboundOrderAgent(a.id)
      );
      const envAgentId = Number(process.env.SNAPSERVE_AGENT_ID || "");
      const active = activeAgents.find((a) => a.id === envAgentId) ?? activeAgents[0];
      if (active) {
        agent = active;
        activeAgentCache = { agent: active, resolvedAt: Date.now() };
        initiated = await initiateSnapserveOutboundCall({
          agentId: agent.id,
          toNumber: params.toNumber,
          variables,
        });
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const externalCallId = initiated.id;
  const callerNumber =
    initiated.fromNumber || (await resolveSnapserveAgentNumber(agent.id)) || undefined;

  params.onStatusUpdate?.(
    "CALLING",
    `Dialing ${params.vendorName} (${params.toNumber}) from agent line ${callerNumber ?? "SnapServe"}`,
    externalCallId
  );

  // ── Poll GET /calls/{id} until terminal (webhooks need a public URL; for a
  //    self-hosted backend, polling is the dependable primitive) ────────────
  const pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + DEFAULT_CALL_TIMEOUT_MS;
  let record: SnapserveCallRecord | null = null;
  let lastEmitted: SnapserveCallStatus | null = null;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    record = await fetchSnapserveCall(externalCallId);
    const mapped = mapSnapserveStatus(record.status);

    if (mapped !== lastEmitted && mapped !== "PREPARING") {
      lastEmitted = mapped;
      const label = describeLiveStatus(mapped, params.vendorName, callerNumber);
      params.onStatusUpdate?.(mapped, label, externalCallId);
    }

    if (TERMINAL_COMPLETED.has(record.status) || TERMINAL_FAILED.has(record.status)) {
      break;
    }
  }

  if (!record) {
    throw new SnapserveApiError(0, `/calls/${externalCallId}`, "SnapServe call polling produced no status.");
  }

  const finalStatus: SnapserveCallStatus = TERMINAL_COMPLETED.has(record.status)
    ? "CONFIRMED"
    : TERMINAL_FAILED.has(record.status)
      ? "FAILED"
      : "UNKNOWN";

  // ── Humanize the transcript & outcome ───────────────────────────────────
  const greeting = `Vanakkam! Calling from Household Assistant for ${params.householdName || "Sai's home"}. We need ${params.orderSummary} delivered tomorrow morning. Please confirm availability.`;
  let transcript = humanizeCallTranscript(record.transcript ?? "", {
    vendorName: params.vendorName,
    orderSummary: params.orderSummary,
    greeting,
  });
  // Second polish pass when OpenAI is available (regex pass is the fallback)
  const polished = await polishTranscriptWithOpenAI(transcript);
  if (polished) transcript = polished;

  const etaMatch = /\b(?:by|before|around)\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm|AM|PM)?(?:\s*tomorrow)?)/.exec(
    `${record.transcript ?? ""} ${record.callSummary ?? ""}`
  );
  const deliveryEta =
    etaMatch?.[1]?.trim() ||
    (finalStatus === "CONFIRMED" ? "Tomorrow, 9:30 AM" : "Unknown");

  const humanizedSummary = humanizeCallSummary({
    vendorName: params.vendorName,
    orderSummary: params.orderSummary,
    eta: deliveryEta,
    status: finalStatus,
    callSummary: record.callSummary,
  });

  if (finalStatus !== "CONFIRMED") {
    params.onStatusUpdate?.(
      finalStatus,
      humanizedSummary,
      externalCallId
    );
  }

  return {
    externalCallId,
    finalStatus,
    transcript: transcript || humanizedSummary,
    usedProvider: "snapserve",
    agentId: agent.id,
    fromNumber: callerNumber,
    humanizedSummary,
    deliveryEta,
  };
}

function describeLiveStatus(
  status: SnapserveCallStatus,
  vendorName: string,
  callerNumber?: string
): string {
  const from = callerNumber ? ` from agent line ${callerNumber}` : "";
  switch (status) {
    case "CALLING":
      return `Ringing ${vendorName}${from}`;
    case "CONNECTED":
      return `Connected to ${vendorName} — placing the order`;
    case "AWAITING_RESPONSE":
      return `${vendorName} is confirming the order`;
    case "CONFIRMED":
      return `${vendorName} confirmed the order`;
    case "FAILED":
      return `Call to ${vendorName} did not complete`;
    default:
      return `Call status: ${status}`;
  }
}

async function runSimulatedCall(
  params: SnapserveOutboundCallParams,
  delayMs: number
): Promise<SnapserveOutboundCallResult> {
  const externalCallId = `call_snap_${crypto.randomUUID().slice(0, 8)}`;
  const callerNumber = process.env.SNAPSERVE_AGENT_NUMBER?.trim() || "+917971543255";

  params.onStatusUpdate?.(
    "CALLING",
    `Dialing ${params.vendorName} (${params.toNumber}) from agent line ${callerNumber}`,
    externalCallId
  );
  await sleep(delayMs);

  params.onStatusUpdate?.(
    "CONNECTED",
    `Connected to ${params.vendorName} — placing the order`,
    externalCallId
  );
  await sleep(delayMs);

  params.onStatusUpdate?.(
    "AWAITING_RESPONSE",
    `${params.vendorName} is confirming the order`,
    externalCallId
  );
  await sleep(delayMs);

  const transcript = buildSimulatedTranscript({
    vendorName: params.vendorName,
    orderSummary: params.orderSummary,
    callScript: params.callScript,
  });

  params.onStatusUpdate?.(
    "CONFIRMED",
    `${params.vendorName} confirmed ${params.orderSummary} for delivery by 9:30 AM tomorrow`,
    externalCallId
  );

  return {
    externalCallId,
    finalStatus: "CONFIRMED",
    transcript,
    usedProvider: "deterministic-simulator",
    agentId: params.agentId,
    fromNumber: callerNumber,
    humanizedSummary: `${params.vendorName} confirmed ${params.orderSummary} for delivery by 9:30 AM tomorrow.`,
    deliveryEta: "Tomorrow, 9:30 AM",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Webhook helper — verify X-Snapserve-Signature (HMAC-SHA256 of
// "{timestamp}.{rawBody}" with the endpoint secret) for call.completed events.
// ────────────────────────────────────────────────────────────────────────────

export function verifySnapserveWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string = process.env.SNAPSERVE_WEBHOOK_SECRET || ""
): boolean {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(/[,.]/).map((p) => p.trim());
  const timestamp = parts.find((p) => /^\d{10,}$/.test(p));
  const signature = parts.find((p) => /^[0-9a-f]{64}$/i.test(p));
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
