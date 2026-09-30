// Inventory reorder workflow: turns the deterministic reorder plan into one
// approval-gated VENDOR_PURCHASE_CALL per vendor. Nothing is dialled here —
// approving the action runs runActionApprovalAndExecutionWorkflow, which issues
// the approval token and places the Snapserve call.
import crypto from "node:crypto";
import type { ActionOrderItem, ActionProposal, AgentRunTrace, WhyEvidence } from "@household/contracts";
import type { HouseholdStore } from "@household/db";
import {
  computePayloadHash,
  describeReorderLine,
  formatQuantityDisplay,
  planInventoryReorders,
  type ReorderGroup,
  type ReorderLine,
} from "@household/domain";
import { AgentTraceRecorder } from "@household/tools";
import { buildVendorCallScript } from "./voice-agent.js";

export interface InventoryReorderResult {
  /** Newly created proposals (unchanged ones are kept, not recreated). */
  created: ActionProposal[];
  /** Every pending reorder proposal after this scan. */
  pending: ActionProposal[];
  /** Stale pending proposals that were withdrawn because stock recovered or changed. */
  withdrawnIds: string[];
  /** Items no vendor can supply. */
  unassigned: string[];
  agentRun: AgentRunTrace | null;
}

/** After a reorder is rejected, don't propose the same item again for this long. */
export const REJECTED_REORDER_COOLDOWN_MS = 24 * 3_600_000;
export const REORDER_DELIVERY_WINDOW = "tomorrow morning before 10:00 AM";

const OPEN_STATUSES = new Set<ActionProposal["status"]>(["PENDING_APPROVAL", "APPROVED", "EXECUTING"]);

const isPendingReorder = (a: ActionProposal) => a.origin === "INVENTORY_REORDER" && a.status === "PENDING_APPROVAL";

/** Same vendor, items and quantities → same proposal; lets a rescan keep the existing one. */
const contentKey = (vendorId: string | undefined, items: Array<{ resourceId: string; orderQuantity: number }>) =>
  `${vendorId ?? ""}|${items
    .map((i) => `${i.resourceId}:${i.orderQuantity}`)
    .sort()
    .join(",")}`;

const REASON_LABEL: Record<ReorderLine["reason"], string> = {
  OUT_OF_STOCK: "Out of stock",
  LOW_STOCK: "Low stock",
  EXPIRING: "Expiring",
};

function evidenceFor(line: ReorderLine, vendorName: string, nowIso: string): WhyEvidence {
  const fmt = (q: number) => formatQuantityDisplay(q, line.baseUnit, line.displayUnit);
  return {
    id: `why_reorder_${line.resourceId}`,
    resourceId: line.resourceId,
    resourceName: line.name,
    headline: `${REASON_LABEL[line.reason]}: ${describeReorderLine(line)}`,
    triggerEventLabel: "Inventory check",
    triggerTimestamp: nowIso,
    requiredQty: line.targetQuantity,
    onHandQty: line.usableQuantity,
    deficitQty: line.orderQuantity,
    unit: line.baseUnit,
    displayUnit: line.displayUnit,
    requiredDisplay: fmt(line.targetQuantity),
    onHandDisplay: fmt(line.usableQuantity),
    deficitDisplay: fmt(line.orderQuantity),
    formulaText:
      line.reason === "EXPIRING"
        ? `target ${fmt(line.targetQuantity)} − (stock − ${fmt(line.expiringQuantity)} expiring) → order ${fmt(line.orderQuantity)}`
        : `target ${fmt(line.targetQuantity)} − available ${fmt(line.usableQuantity)} → order ${fmt(line.orderQuantity)}`,
    proposedResolution: `Order ${fmt(line.orderQuantity)} from ${vendorName}`,
    vendorName,
    sources: ["inventory", "lots", "vendors"],
  };
}

function buildProposal(group: ReorderGroup, householdId: string, householdName: string, nowIso: string): ActionProposal {
  const actionId = `act_ro_${crypto.randomUUID().slice(0, 8)}`;
  const vendor = group.vendor;
  const items: ActionOrderItem[] = group.lines.map((line) => ({
    resourceId: line.resourceId,
    name: line.name,
    deficitDisplay: formatQuantityDisplay(line.orderQuantity, line.baseUnit, line.displayUnit),
    orderQuantity: line.orderQuantity,
    orderUnit: line.baseUnit,
    orderDisplay: formatQuantityDisplay(line.orderQuantity, line.baseUnit, line.displayUnit),
    estimatedCostInr: line.estimatedCostInr,
  }));
  const payloadHash = computePayloadHash({
    actionId,
    householdId,
    vendorId: vendor.id,
    items: items.map((i) => ({ resourceId: i.resourceId, orderQuantity: i.orderQuantity, orderUnit: i.orderUnit })),
  });

  return {
    id: actionId,
    householdId,
    sourceEventId: `evt_reorder_${actionId.slice(7)}`,
    type: "VENDOR_PURCHASE_CALL",
    origin: "INVENTORY_REORDER",
    status: "PENDING_APPROVAL",
    title: `Restock from ${vendor.name}`,
    subtitle: `${vendor.name} · Tomorrow morning delivery`,
    reasonSummary: `${group.lines.map(describeReorderLine).join("; ")}.`,
    whyEvidence: group.lines.map((line) => evidenceFor(line, vendor.name, nowIso)),
    targetVendor: vendor,
    items,
    estimatedTotalCostInr: group.estimatedTotalCostInr,
    deliveryWindow: "Tomorrow morning (before 10:00 AM)",
    callScript: buildVendorCallScript({
      householdName,
      items: items.map((i) => ({ orderDisplay: i.orderDisplay, name: i.name })),
      deliveryWindow: REORDER_DELIVERY_WINDOW,
    }).combined,
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
}

/**
 * Scan inventory and keep one pending reorder proposal per vendor in step with it.
 * Safe to call often: unchanged proposals are kept, stale ones withdrawn, and
 * items already on an open order (or recently rejected) are left alone.
 */
export async function runInventoryReorderWorkflow(
  store: HouseholdStore,
  options: { householdId?: string; trigger?: string; now?: Date } = {},
): Promise<InventoryReorderResult> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const state = store.getState();
  const householdId = options.householdId ?? state.households[0]?.id ?? "hh_demo_001";
  const householdName = state.households.find((h) => h.id === householdId)?.name ?? "our home";

  const householdActions = state.actions.filter((a) => a.householdId === householdId);
  const exclude = new Set<string>();
  for (const a of householdActions) {
    const onOpenOrder = OPEN_STATUSES.has(a.status) && !isPendingReorder(a);
    const recentlyRejected =
      a.origin === "INVENTORY_REORDER" &&
      a.status === "REJECTED" &&
      now.getTime() - new Date(a.updatedAt).getTime() < REJECTED_REORDER_COOLDOWN_MS;
    if (onOpenOrder || recentlyRejected) for (const i of a.items) exclude.add(i.resourceId);
  }

  const plan = planInventoryReorders({
    householdId,
    resources: state.resources,
    lots: state.lots,
    vendors: state.vendors,
    excludeResourceIds: exclude,
    now,
  });

  const existingPending = householdActions.filter(isPendingReorder);
  const keep = new Set<string>();
  const drafts: ActionProposal[] = [];
  for (const group of plan.groups) {
    const key = contentKey(
      group.vendor.id,
      group.lines.map((l) => ({ resourceId: l.resourceId, orderQuantity: l.orderQuantity })),
    );
    const same = existingPending.find((a) => contentKey(a.targetVendor?.id, a.items) === key);
    if (same) keep.add(same.id);
    else drafts.push(buildProposal(group, householdId, householdName, nowIso));
  }
  const withdrawnIds = existingPending.filter((a) => !keep.has(a.id)).map((a) => a.id);
  const unassigned = plan.unassigned.map((l) => l.name);

  if (drafts.length === 0 && withdrawnIds.length === 0) {
    return {
      created: [],
      pending: existingPending,
      withdrawnIds,
      unassigned,
      agentRun: null,
    };
  }

  const recorder = new AgentTraceRecorder(store, householdId, "INVENTORY_REORDER");
  const created = await recorder.runStep({
    agentName: "ActionPlannerAgent",
    executionMode: "DETERMINISTIC_ENGINE",
    action: "Prepared vendor restock calls",
    reason: `${options.trigger ?? "Inventory check"}: ${plan.groups
      .flatMap((g) => g.lines.map((l) => `${l.name} (${REASON_LABEL[l.reason].toLowerCase()})`))
      .join(", ") || "stock recovered"}`,
    execute: async ({ callTool }) =>
      callTool(
        "action.prepare",
        `Restock proposals for ${drafts.length} vendor(s); withdraw ${withdrawnIds.length}`,
        () => {
          store.mutate(
            (draft) => {
              draft.actions = draft.actions.filter((a) => !withdrawnIds.includes(a.id));
              draft.actions.unshift(...drafts);
              for (const p of drafts) {
                draft.timeline.unshift({
                  id: `tl_ro_${crypto.randomUUID().slice(0, 6)}`,
                  householdId,
                  eventId: p.sourceEventId,
                  timestamp: nowIso,
                  timeFormatted: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
                  title: `Restock call ready for ${p.targetVendor?.name ?? "vendor"}`,
                  description: `${p.reasonSummary} Approve to call and place the order.`,
                  category: "action",
                  status: "WARNING",
                  relatedActionId: p.id,
                });
              }
            },
            {
              householdId,
              actor: "ActionPlannerAgent",
              operation: "REORDER_PROPOSED",
              entityType: "ActionProposal",
              entityId: drafts.map((d) => d.id).join(",") || withdrawnIds.join(","),
            },
          );
          return drafts;
        },
        (list) => `${list.length} restock call(s) awaiting approval`,
      ),
  });
  const agentRun = recorder.finalize("COMPLETED");

  const pending = store.getState().actions.filter((a) => a.householdId === householdId && isPendingReorder(a));
  return { created, pending, withdrawnIds, unassigned, agentRun };
}
