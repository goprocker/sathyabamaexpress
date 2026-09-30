// Phone ordering: a household member calls the Snapserve ordering agent, says
// what they want and confirms it. This workflow turns that confirmed order into
// one VENDOR_PURCHASE_CALL per store and executes each through the normal
// approval-token path (runActionApprovalAndExecutionWorkflow) — the caller's
// spoken confirmation from their registered phone is the approval.
import crypto from "node:crypto";
import type { ActionOrderItem, ActionProposal } from "@household/contracts";
import type { HouseholdStore } from "@household/db";
import { computePayloadHash, parseSpokenOrder, planVoiceOrder, type VoiceOrderGroup } from "@household/domain";
import { buildVendorCallScript } from "./voice-agent.js";
import { runActionApprovalAndExecutionWorkflow, type RealtimeBroadcastCallback } from "./index.js";

export interface VoiceOrderInput {
  /** Snapserve id of the inbound call the order was taken on. */
  callId: string;
  callerPhone: string;
  /** "2 kg rice; 1 litre milk" as extracted from the call. */
  orderText: string;
  preferredStore?: string | null;
  deliveryNote?: string | null;
  /** The household member the call was verified against; approvals are bound to them. */
  approverUserId: string;
  householdId?: string;
  stepDelayMs?: number;
  onBroadcast?: RealtimeBroadcastCallback;
  /** false: save the per-store orders and stop, leaving each call to a "Call store" tap. */
  execute?: boolean;
}

export interface VoiceOrderResult {
  /** True when this call was already handled. */
  duplicate: boolean;
  actions: ActionProposal[];
  /** Items no onboarded store could supply. */
  unassigned: string[];
}

export const voiceOrderEventId = (callId: string) => `evt_call_${callId}`;

const DEFAULT_DELIVERY = "tomorrow morning before 10:00 AM";

function buildProposal(
  group: VoiceOrderGroup,
  input: VoiceOrderInput,
  householdId: string,
  householdName: string | undefined,
  nowIso: string,
): ActionProposal {
  const actionId = `act_vo_${crypto.randomUUID().slice(0, 8)}`;
  const vendor = group.vendor;
  const items: ActionOrderItem[] = group.lines.map((l) => ({
    resourceId: l.resourceId,
    name: l.name,
    deficitDisplay: l.orderDisplay,
    orderQuantity: l.orderQuantity,
    orderUnit: l.baseUnit,
    orderDisplay: l.orderDisplay,
    estimatedCostInr: l.estimatedCostInr,
  }));
  const delivery = input.deliveryNote?.trim() || DEFAULT_DELIVERY;
  const said = items.map((i) => `${i.orderDisplay} ${i.name}`).join(", ");
  return {
    id: actionId,
    householdId,
    sourceEventId: voiceOrderEventId(input.callId),
    type: "VENDOR_PURCHASE_CALL",
    origin: "VOICE_ORDER",
    status: "PENDING_APPROVAL",
    title: `Phone order from ${vendor.name}`,
    subtitle: `${vendor.name} · ${delivery}`,
    reasonSummary: `You ordered ${said} by phone (call ${input.callId}) and confirmed it on the call.`,
    whyEvidence: group.lines.map((l) => ({
      id: `why_vo_${input.callId}_${l.resourceId}`,
      resourceId: l.resourceId,
      resourceName: l.name,
      headline: `Ordered by phone: ${l.orderDisplay} ${l.name}`,
      triggerEventLabel: "Phone order",
      triggerTimestamp: nowIso,
      requiredDisplay: l.orderDisplay,
      onHandDisplay: "—",
      deficitDisplay: l.orderDisplay,
      proposedResolution: `Buy ${l.orderDisplay} from ${vendor.name}`,
      vendorName: vendor.name,
      sources: ["phone-order"],
    })),
    targetVendor: vendor,
    items,
    estimatedTotalCostInr: group.estimatedTotalCostInr,
    deliveryWindow: delivery,
    callScript: buildVendorCallScript({
      householdName,
      items: items.map((i) => ({ orderDisplay: i.orderDisplay, name: i.name })),
      deliveryWindow: delivery,
    }).combined,
    payloadHash: computePayloadHash({
      actionId,
      householdId,
      vendorId: vendor.id,
      items: items.map((i) => ({ resourceId: i.resourceId, orderQuantity: i.orderQuantity, orderUnit: i.orderUnit })),
    }),
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
}

/** Records the phone order and calls each store. Safe to call twice for the same call id. */
export async function runVoiceOrderWorkflow(store: HouseholdStore, input: VoiceOrderInput): Promise<VoiceOrderResult> {
  const state = store.getState();
  const householdId = input.householdId ?? state.households[0]?.id ?? "hh_demo_001";
  const eventId = voiceOrderEventId(input.callId);
  const existing = state.actions.filter((a) => a.sourceEventId === eventId);
  if (existing.length > 0) return { duplicate: true, actions: existing, unassigned: [] };

  const items = parseSpokenOrder(input.orderText);
  const plan = planVoiceOrder({
    householdId,
    items,
    resources: state.resources,
    vendors: state.vendors,
    preferredStore: input.preferredStore,
  });
  const householdName = state.households.find((h) => h.id === householdId)?.name;
  const now = new Date();
  const nowIso = now.toISOString();
  const proposals = plan.groups.map((g) => buildProposal(g, input, householdId, householdName, nowIso));

  store.mutate(
    (draft) => {
      draft.actions.unshift(...proposals);
      draft.timeline.unshift({
        id: `tl_vo_${crypto.randomUUID().slice(0, 6)}`,
        householdId,
        eventId,
        timestamp: nowIso,
        timeFormatted: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        title: "Phone order received",
        description:
          proposals.length > 0
            ? `${items.length} item(s) confirmed on the call from ${input.callerPhone}; calling ${proposals
                .map((p) => p.targetVendor?.name)
                .join(", ")}.${plan.unassigned.length ? ` No store sells: ${plan.unassigned.join(", ")}.` : ""}`
            : `Couldn't place "${input.orderText}": ${items.length ? "no store sells these items" : "no items understood"}.`,
        category: "action",
        status: proposals.length > 0 ? "INFO" : "WARNING",
      });
    },
    {
      householdId,
      actor: "PhoneOrderAgent",
      operation: "VOICE_ORDER_RECEIVED",
      entityType: "ActionProposal",
      entityId: proposals.map((p) => p.id).join(",") || eventId,
    },
  );
  input.onBroadcast?.("REORDER_PROPOSED", { created: proposals.map((p) => p.id), withdrawn: [], pending: [] });

  if (input.execute === false) return { duplicate: false, actions: proposals, unassigned: plan.unassigned };

  // One store at a time: each call runs through the approval token + Snapserve path.
  const actions: ActionProposal[] = [];
  for (const proposal of proposals) {
    const { action } = await runActionApprovalAndExecutionWorkflow(store, {
      actionId: proposal.id,
      userId: input.approverUserId,
      idempotencyKey: `voice_${input.callId}_${proposal.targetVendor?.id ?? proposal.id}`,
      stepDelayMs: input.stepDelayMs,
      onBroadcast: input.onBroadcast,
    });
    actions.push(action);
  }
  return { duplicate: false, actions, unassigned: plan.unassigned };
}
