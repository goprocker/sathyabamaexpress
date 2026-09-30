// Household notifications: keeps the feed in step with inventory and orders,
// and sends new ones to the household's phones with Web Push.
import type { FastifyInstance } from "fastify";
import webpush from "web-push";
import {
  PushSubscriptionInputSchema,
  type HouseholdNotification,
  type HouseholdNotificationKind,
} from "@household/contracts";
import type { HouseholdStore } from "@household/db";
import { applyNotificationDiff, diffNotifications } from "@household/domain";
import { currentUser } from "./request-context.js";

/** Not pushed to phones: the confirmation or failure that follows is the useful one. */
const QUIET_KINDS = new Set<HouseholdNotificationKind>(["ORDER_PLACED"]);
/** How far back the notification centre shows. */
const FEED_DAYS = 7;

const GROUP_TITLE: Record<HouseholdNotification["category"], string> = {
  approval: "Needs your approval",
  inventory: "Inventory",
  transaction: "Orders & purchases",
};

export interface FeedItem {
  id: string;
  group: string;
  module: "kitchen";
  title: string;
  detail: string;
  minutesAgo: number;
  href: string;
  read: boolean;
}

function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || "https://example.com" };
}

export interface NotificationService {
  /** Re-derives notifications from current state; pushes and returns the new ones. */
  refresh: () => Promise<HouseholdNotification[]>;
  feed: () => FeedItem[];
  markRead: (ids: string[] | "all") => void;
}

export function createNotificationService(
  store: HouseholdStore,
  deps: { broadcast: (event: string, payload: Record<string, unknown>) => void; log: (msg: string, detail?: unknown) => void },
): NotificationService {
  const householdId = () => store.getState().households[0]?.id ?? "hh_demo_001";
  // One refresh at a time per household, so two triggers can't raise the same notification twice.
  const chains = new Map<string, Promise<unknown>>();

  const push = async (created: HouseholdNotification[]) => {
    const keys = vapid();
    const subs = store.getState().pushSubscriptions ?? [];
    const toSend = created.filter((n) => !QUIET_KINDS.has(n.kind));
    if (!keys || subs.length === 0 || toSend.length === 0) return;
    const gone = new Set<string>();
    for (const n of toSend.slice(0, 5)) {
      const payload = JSON.stringify({ title: n.title, body: n.body, url: n.href, tag: n.dedupeKey, id: n.id });
      await Promise.all(
        subs.map(async (sub) => {
          if (gone.has(sub.endpoint)) return;
          try {
            await webpush.sendNotification(sub, payload, {
              vapidDetails: keys,
              TTL: 6 * 3600,
              urgency: n.category === "transaction" ? "normal" : "high",
            });
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            // 404/410: the browser dropped this subscription.
            if (status === 404 || status === 410) gone.add(sub.endpoint);
            else deps.log("push failed", { status, endpoint: sub.endpoint.slice(0, 60) });
          }
        }),
      );
    }
    if (gone.size) {
      store.mutate((draft) => {
        draft.pushSubscriptions = (draft.pushSubscriptions ?? []).filter((s) => !gone.has(s.endpoint));
      });
    }
  };

  const refreshOnce = async (): Promise<HouseholdNotification[]> => {
    const state = store.getState();
    const hid = householdId();
    const diff = diffNotifications({
      householdId: hid,
      resources: state.resources,
      lots: state.lots,
      actions: state.actions,
      receipts: state.receiptUploads,
      existing: state.notifications ?? [],
    });
    if (diff.created.length === 0 && diff.resolvedKeys.length === 0) return [];
    store.mutate(
      (draft) => {
        draft.notifications = applyNotificationDiff(draft.notifications ?? [], diff);
      },
      { householdId: hid, actor: "NotificationEngine", operation: "NOTIFICATIONS_UPDATED", entityType: "Notification", entityId: diff.created.map((n) => n.id).join(",") || "resolved" },
    );
    deps.broadcast("NOTIFICATIONS_UPDATED", { created: diff.created.length, resolved: diff.resolvedKeys.length });
    await push(diff.created);
    return diff.created;
  };

  return {
    refresh: () => {
      const key = currentUser()?.userId ?? "demo";
      const next = (chains.get(key) ?? Promise.resolve()).catch(() => undefined).then(refreshOnce);
      chains.set(key, next);
      void next.finally(() => {
        if (chains.get(key) === next) chains.delete(key);
      });
      return next.catch((err) => {
        deps.log("notification refresh failed", err);
        return [];
      });
    },

    feed: () => {
      const now = Date.now();
      return (store.getState().notifications ?? [])
        .filter((n) => now - Date.parse(n.createdAt) < FEED_DAYS * 86_400_000)
        .map((n) => ({
          id: n.id,
          group: GROUP_TITLE[n.category],
          module: "kitchen" as const,
          title: n.title,
          detail: n.body,
          minutesAgo: Math.max(0, Math.round((now - Date.parse(n.createdAt)) / 60_000)),
          href: n.href,
          read: Boolean(n.readAt),
        }));
    },

    markRead: (ids) => {
      const nowIso = new Date().toISOString();
      const target = ids === "all" ? null : new Set(ids);
      store.mutate((draft) => {
        for (const n of draft.notifications ?? []) if (!n.readAt && (!target || target.has(n.id))) n.readAt = nowIso;
      });
    },
  };
}

export function registerPushRoutes(app: FastifyInstance, store: HouseholdStore) {
  app.get("/api/push/public-key", async () => ({ publicKey: vapid()?.publicKey ?? null }));

  app.post("/api/push/subscribe", async (request, reply) => {
    if (!vapid()) return reply.code(503).send({ error: "Phone notifications aren't set up on this server." });
    const sub = PushSubscriptionInputSchema.parse(request.body ?? {});
    store.mutate((draft) => {
      const rest = (draft.pushSubscriptions ?? []).filter((s) => s.endpoint !== sub.endpoint);
      // A household rarely has more than a few devices; keep the newest 10.
      draft.pushSubscriptions = [{ ...sub, createdAt: new Date().toISOString() }, ...rest].slice(0, 10);
    });
    return { ok: true };
  });

  app.post("/api/push/unsubscribe", async (request) => {
    const endpoint = String((request.body as { endpoint?: unknown } | undefined)?.endpoint ?? "");
    store.mutate((draft) => {
      draft.pushSubscriptions = (draft.pushSubscriptions ?? []).filter((s) => s.endpoint !== endpoint);
    });
    return { ok: true };
  });

  /** Sends a test notification to this household's devices. */
  app.post("/api/push/test", async (request, reply) => {
    const keys = vapid();
    const subs = store.getState().pushSubscriptions ?? [];
    if (!keys) return reply.code(503).send({ error: "Phone notifications aren't set up on this server." });
    if (subs.length === 0) return reply.code(409).send({ error: "Turn on notifications on this device first." });
    const payload = JSON.stringify({
      title: "Notifications are on",
      body: "You'll hear about low stock, expiring food and your orders here.",
      url: "/notifications",
      tag: "test",
    });
    const results = await Promise.allSettled(subs.map((s) => webpush.sendNotification(s, payload, { vapidDetails: keys, TTL: 600 })));
    return { sent: results.filter((r) => r.status === "fulfilled").length, devices: subs.length };
  });

}
