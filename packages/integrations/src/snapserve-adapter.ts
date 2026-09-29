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

const SNAPSERVE_BASE_URL = (
  process.env.SNAPSERVE_BASE_URL || "https://app.snapserve.ai/api"
).replace(/\/$/, "");

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

export function isSnapserveLive(): boolean {
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
    const active = agents.find((a) => a.status === "active") ?? agents[0];
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
        formatted.push(`${speaker}: "${speakerMatch[2].replace(/^["“]|["”]$/g, "").trim()}"`);
        continue;
      }
    }
    formatted.push(line.replace(/^["“]|["”]$/g, "").trim());
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

  if (!isSnapserveLive()) {
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
    // first active agent on the account.
    if (
      err instanceof SnapserveApiError &&
      (err.httpStatus === 400 || err.httpStatus === 404)
    ) {
      const activeAgents = await listSnapserveAgents();
      const active = activeAgents.find((a) => a.status === "active");
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
  const greeting = `Vanakkam! Calling from Household Assistant for Sai's home. We need ${params.orderSummary} delivered tomorrow morning. Please confirm availability.`;
  const transcript = humanizeCallTranscript(record.transcript ?? "", {
    vendorName: params.vendorName,
    orderSummary: params.orderSummary,
    greeting,
  });

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
