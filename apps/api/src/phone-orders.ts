// Phone ordering intake. The household calls the Snapserve ordering agent; when
// the call ends, Snapserve extracts the order (dispositionSchema). This watcher
// polls the agent's calls, verifies the caller against the household's
// registered phone, and hands confirmed orders to runVoiceOrderWorkflow, which
// calls each store.
import type { HouseholdStore } from "@household/db";
import { samePhone } from "@household/domain";
import type { SnapserveCallListItem } from "@household/integrations";
import { runWithUser } from "./request-context.js";
import { orderingMember } from "./store-routes.js";
import type { UserStores } from "./user-stores.js";

/** Fields the ordering agent's dispositionSchema extracts (see scripts/setup-order-agents.ts). */
export interface PhoneOrderDisposition {
  orderText: string;
  confirmed: boolean;
  preferredStore: string | null;
  deliveryNote: string | null;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() && !/^(none|n\/a|null|-)$/i.test(v.trim()) ? v.trim() : null);

export function readOrderDisposition(disposition: Record<string, unknown> | null): PhoneOrderDisposition | null {
  if (!disposition) return null;
  const orderText = text(disposition.order_items);
  const rawConfirmed = disposition.order_confirmed;
  const confirmed = rawConfirmed === true || (typeof rawConfirmed === "string" && /^(true|yes)$/i.test(rawConfirmed.trim()));
  if (!orderText) return null;
  return {
    orderText,
    confirmed,
    preferredStore: text(disposition.preferred_store),
    deliveryNote: text(disposition.delivery_note),
  };
}

const IN_PROGRESS = new Set(["pending", "ringing", "in_progress", "connected", "queued"]);
/** Snapserve fills the disposition shortly after hang-up; wait this long for it. */
const DISPOSITION_WAIT_MS = 10 * 60_000;
/** Ignore calls older than this when the watcher first sees them (history before setup). */
const MAX_CALL_AGE_MS = 60 * 60_000;

export type PhoneOrderOutcome =
  | { kind: "ignored"; reason: string }
  | { kind: "waiting" }
  | { kind: "order"; call: SnapserveCallListItem; order: PhoneOrderDisposition };

/** Decides what to do with one call from the ordering agent's list. Pure, for testing. */
export function classifyOrderCall(call: SnapserveCallListItem, now: number): PhoneOrderOutcome {
  if (call.direction !== "inbound") return { kind: "ignored", reason: "not inbound" };
  const ended = Date.parse(call.endedAt ?? call.createdAt ?? "");
  if (IN_PROGRESS.has(call.status)) return { kind: "waiting" };
  if (call.status !== "completed") return { kind: "ignored", reason: `call ${call.status}` };
  if (Number.isFinite(ended) && now - ended > MAX_CALL_AGE_MS) return { kind: "ignored", reason: "too old" };
  const order = readOrderDisposition(call.disposition);
  if (!order) {
    return Number.isFinite(ended) && now - ended < DISPOSITION_WAIT_MS
      ? { kind: "waiting" }
      : { kind: "ignored", reason: "no order extracted" };
  }
  if (!order.confirmed) return { kind: "ignored", reason: "caller did not confirm" };
  return { kind: "order", call, order };
}

export interface PhoneOrderWatcherOptions {
  agentId: number;
  intervalMs: number;
  listCalls: (agentId: number) => Promise<SnapserveCallListItem[]>;
  /** The shared demo store (used when accounts are off). */
  demoStore: HouseholdStore;
  userStores: UserStores | null;
  /** Places the order for the household the caller belongs to. Runs inside that user's context. */
  placeOrder: (store: HouseholdStore, approverUserId: string, call: SnapserveCallListItem, order: PhoneOrderDisposition) => Promise<void>;
  onLog?: (message: string, detail?: Record<string, unknown>) => void;
}

/** The household whose registered phone matches the caller, if any. */
async function findHousehold(
  callerPhone: string,
  options: Pick<PhoneOrderWatcherOptions, "demoStore" | "userStores">,
): Promise<{ userId: string | null; store: HouseholdStore; memberId: string } | null> {
  if (!options.userStores) {
    const member = orderingMember(options.demoStore);
    return member && samePhone(member.phoneE164, callerPhone)
      ? { userId: null, store: options.demoStore, memberId: member.id }
      : null;
  }
  for (const userId of await options.userStores.listUserIds()) {
    const store = await options.userStores.get(userId);
    const member = orderingMember(store);
    if (member && samePhone(member.phoneE164, callerPhone)) return { userId, store, memberId: member.id };
  }
  return null;
}

export function startPhoneOrderWatcher(options: PhoneOrderWatcherOptions): () => void {
  const done = new Set<string>();
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const calls = await options.listCalls(options.agentId);
      for (const call of calls) {
        if (done.has(call.id)) continue;
        const outcome = classifyOrderCall(call, Date.now());
        if (outcome.kind === "waiting") continue;
        done.add(call.id);
        if (outcome.kind === "ignored") continue;

        const caller = call.fromNumber ?? "";
        const household = await findHousehold(caller, options);
        if (!household) {
          options.onLog?.("phone order from an unregistered number ignored", { callId: call.id, caller });
          continue;
        }
        const approver = household.userId ?? household.memberId;
        const run = () => options.placeOrder(household.store, approver, call, outcome.order);
        try {
          if (household.userId) {
            await runWithUser({ userId: household.userId, store: household.store }, run);
            await options.userStores?.flush(household.userId);
          } else {
            await run();
          }
        } catch (err) {
          options.onLog?.("phone order failed", { callId: call.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    } catch (err) {
      options.onLog?.("phone order watcher could not list calls", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), options.intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
