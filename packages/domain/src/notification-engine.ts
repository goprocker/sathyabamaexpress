// Household notifications (deterministic). Compares what is true now — stock
// levels, expiring lots, order calls, recorded purchases — with the
// notifications already raised, and returns only what is new plus the
// conditions that have cleared. One live notification per dedupe key, so
// "milk is low" is raised once, and again only if it recovers and drops later.
import crypto from "node:crypto";
import type {
  ActionProposal,
  HouseholdNotification,
  InventoryLot,
  ReceiptUpload,
  Resource,
} from "@household/contracts";
import { REORDER_EXPIRY_WINDOW_HOURS } from "./reorder-engine.js";
import { formatQuantityDisplay } from "./unit-normalizer.js";

export interface NotificationSources {
  householdId: string;
  resources: Resource[];
  lots: InventoryLot[];
  actions: ActionProposal[];
  receipts: ReceiptUpload[];
  existing: HouseholdNotification[];
  now?: Date;
}

export interface NotificationDiff {
  created: HouseholdNotification[];
  /** Dedupe keys of live notifications whose condition has cleared. */
  resolvedKeys: string[];
}

/** Transactions older than this when first seen (e.g. history before notifications existed) are not announced. */
const TRANSACTION_LOOKBACK_MS = 48 * 3_600_000;
/** Keep the feed bounded. */
export const MAX_NOTIFICATIONS = 200;

type Draft = Omit<HouseholdNotification, "id" | "householdId" | "createdAt" | "readAt" | "resolvedAt">;

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Calendar date in the household's timezone (India by default), e.g. "2026-09-30". */
const localDate = (ms: number, timeZone: string) => new Date(ms).toLocaleDateString("en-CA", { timeZone });

function relativeDay(iso: string, now: Date, timeZone = "Asia/Kolkata"): string {
  const at = Date.parse(iso);
  if (at < now.getTime()) return "has expired";
  const days = Math.round(
    (Date.parse(localDate(at, timeZone)) - Date.parse(localDate(now.getTime(), timeZone))) / 86_400_000,
  );
  if (days <= 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

/** Stock conditions that should be notified right now, keyed. */
function inventoryConditions(src: NotificationSources, now: Date): Map<string, Draft> {
  const out = new Map<string, Draft>();
  const horizon = now.getTime() + REORDER_EXPIRY_WINDOW_HOURS * 3_600_000;
  const restockFor = new Map<string, ActionProposal>();
  for (const a of src.actions) {
    if (a.status === "PENDING_APPROVAL" || a.status === "APPROVED" || a.status === "EXECUTING") {
      for (const i of a.items) restockFor.set(i.resourceId, a);
    }
  }

  for (const r of src.resources) {
    if (r.householdId !== src.householdId) continue;
    const fmt = (q: number) => formatQuantityDisplay(q, r.baseUnit, r.displayUnit);
    const available = r.onHandQuantity - r.reservedQuantity;
    const onOrder = restockFor.get(r.id);
    const followUp = onOrder
      ? onOrder.status === "PENDING_APPROVAL"
        ? " A restock call is ready for your approval."
        : ` Being ordered from ${onOrder.targetVendor?.name ?? "the store"}.`
      : r.incomingQuantity > 0
        ? ` ${fmt(r.incomingQuantity)} is on the way.`
        : "";
    const href = onOrder?.status === "PENDING_APPROVAL" ? "/actions" : "/inventory";

    if (available <= 0 && r.safetyThreshold > 0) {
      out.set(`inv:${r.id}:out`, {
        kind: "INVENTORY_OUT",
        category: "inventory",
        title: `${r.canonicalName} is out of stock`,
        body: `Nothing left.${followUp}`,
        href,
        dedupeKey: `inv:${r.id}:out`,
      });
    } else if (available > 0 && available <= r.safetyThreshold) {
      out.set(`inv:${r.id}:low`, {
        kind: "INVENTORY_LOW",
        category: "inventory",
        title: `${r.canonicalName} is running low`,
        body: `${fmt(available)} left (you usually keep ${fmt(r.safetyThreshold)}).${followUp}`,
        href,
        dedupeKey: `inv:${r.id}:low`,
      });
    }

    const expiring = src.lots.filter(
      (l) =>
        l.resourceId === r.id &&
        l.quantityRemaining > 0 &&
        l.status !== "DEPLETED" &&
        l.expiresAt &&
        Date.parse(l.expiresAt) <= horizon,
    );
    if (expiring.length > 0 && r.onHandQuantity > 0) {
      const soonest = expiring.map((l) => l.expiresAt ?? "").sort()[0] ?? "";
      const qty = Math.min(
        r.onHandQuantity,
        expiring.reduce((s, l) => s + l.quantityRemaining, 0),
      );
      // Keyed by the lot's expiry date, so a new batch expiring later notifies again.
      const key = `inv:${r.id}:exp:${soonest.slice(0, 10)}`;
      out.set(key, {
        kind: "INVENTORY_EXPIRING",
        category: "inventory",
        title: `${r.canonicalName} ${relativeDay(soonest, now)}`,
        body: `${fmt(qty)} to use up or replace.${followUp}`,
        href,
        dedupeKey: key,
      });
    }
  }
  return out;
}

/** Order and purchase events worth telling the household about. */
function transactionEvents(src: NotificationSources, now: Date): Map<string, Draft & { at: string }> {
  const out = new Map<string, Draft & { at: string }>();
  for (const a of src.actions) {
    if (a.householdId !== src.householdId || a.type !== "VENDOR_PURCHASE_CALL") continue;
    const vendor = a.targetVendor?.name ?? "the store";
    const items = a.items.map((i) => `${i.orderDisplay} ${i.name}`).join(", ");
    if (a.status === "PENDING_APPROVAL") {
      out.set(`act:${a.id}:ready`, {
        kind: "RESTOCK_READY",
        category: "approval",
        title: `Approve an order from ${vendor}`,
        body: `${items} · about ${inr(a.estimatedTotalCostInr)}. Approve and the agent calls to order.`,
        href: "/actions",
        dedupeKey: `act:${a.id}:ready`,
        at: a.createdAt,
      });
    }
    if (a.status === "EXECUTING" || a.status === "CONFIRMED" || a.status === "FAILED") {
      out.set(`act:${a.id}:placed`, {
        kind: "ORDER_PLACED",
        category: "transaction",
        title: `Calling ${vendor} to order`,
        body: items,
        href: "/actions",
        dedupeKey: `act:${a.id}:placed`,
        at: a.approvedAt ?? a.updatedAt,
      });
    }
    if (a.status === "CONFIRMED") {
      const outcome = a.outcome;
      const eta = outcome?.deliveryEta ? ` · delivery ${outcome.deliveryEta}` : "";
      out.set(`act:${a.id}:confirmed`, {
        kind: "ORDER_CONFIRMED",
        category: "transaction",
        title: `${vendor} confirmed your order`,
        body: `${items} · about ${inr(a.estimatedTotalCostInr)}${eta}. ${outcome?.vendorResponseSummary ?? ""}`.trim(),
        href: "/actions",
        dedupeKey: `act:${a.id}:confirmed`,
        at: outcome?.reconciledAt ?? a.updatedAt,
      });
    }
    if (a.status === "FAILED") {
      out.set(`act:${a.id}:failed`, {
        kind: "ORDER_FAILED",
        category: "transaction",
        title: `Order to ${vendor} didn't go through`,
        body: `${items}. ${a.outcome?.vendorResponseSummary ?? "The store didn't confirm on the call."}`.trim(),
        href: "/actions",
        dedupeKey: `act:${a.id}:failed`,
        at: a.updatedAt,
      });
    }
  }
  for (const r of src.receipts) {
    if (r.householdId !== src.householdId || r.status !== "COMMITTED") continue;
    const count = r.items.length;
    out.set(`rcpt:${r.id}`, {
      kind: "PURCHASE_RECORDED",
      category: "transaction",
      title: r.totalAmountInr ? `${inr(r.totalAmountInr)} spent at ${r.vendorName}` : `Purchase from ${r.vendorName} recorded`,
      body: `${count} item${count === 1 ? "" : "s"} added to your inventory.`,
      href: "/inventory",
      dedupeKey: `rcpt:${r.id}`,
      at: r.committedAt ?? r.purchaseDate ?? now.toISOString(),
    });
  }
  // Drop events that are too old to be news.
  for (const [key, e] of out) {
    if (now.getTime() - Date.parse(e.at) > TRANSACTION_LOOKBACK_MS) out.delete(key);
  }
  return out;
}

export function diffNotifications(src: NotificationSources): NotificationDiff {
  const now = src.now ?? new Date();
  const nowIso = now.toISOString();
  const live = new Map(src.existing.filter((n) => !n.resolvedAt).map((n) => [n.dedupeKey, n]));
  const everRaised = new Set(src.existing.map((n) => n.dedupeKey));

  const inventory = inventoryConditions(src, now);
  const transactions = transactionEvents(src, now);
  const created: HouseholdNotification[] = [];
  const make = (d: Draft): HouseholdNotification => ({
    ...d,
    id: `ntf_${crypto.randomUUID().slice(0, 10)}`,
    householdId: src.householdId,
    createdAt: nowIso,
    readAt: null,
    resolvedAt: null,
  });

  // Inventory: raise while the condition holds; resolve when it clears.
  for (const [key, d] of inventory) if (!live.has(key)) created.push(make(d));
  // Transactions happen once: never repeat a key.
  for (const [key, { at: _at, ...d }] of transactions) if (!everRaised.has(key)) created.push(make(d));

  const resolvedKeys: string[] = [];
  for (const [key, n] of live) {
    const stillTrue =
      n.category === "inventory"
        ? inventory.has(key)
        : n.kind === "RESTOCK_READY"
          ? src.actions.some((a) => `act:${a.id}:ready` === key && a.status === "PENDING_APPROVAL")
          : true;
    if (!stillTrue) resolvedKeys.push(key);
  }
  return { created, resolvedKeys };
}

/** Applies a diff to the stored feed (newest first, bounded). Resolved items are marked read. */
export function applyNotificationDiff(
  existing: HouseholdNotification[],
  diff: NotificationDiff,
  now: Date = new Date(),
): HouseholdNotification[] {
  const nowIso = now.toISOString();
  const resolved = new Set(diff.resolvedKeys);
  const updated = existing.map((n) =>
    !n.resolvedAt && resolved.has(n.dedupeKey) ? { ...n, resolvedAt: nowIso, readAt: n.readAt ?? nowIso } : n,
  );
  return [...diff.created, ...updated].slice(0, MAX_NOTIFICATIONS);
}
