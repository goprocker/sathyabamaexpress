// Stores the household buys from (onboarded with a phone number the agent can
// call) and the phone-ordering setup: which number to call, and which caller
// number is allowed to place orders.
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  OrderingPhoneInputSchema,
  StoreInputSchema,
  StoreUpdateSchema,
  type OrderingSetup,
  type Vendor,
} from "@household/contracts";
import type { HouseholdStore } from "@household/db";
import { normalizePhoneE164 } from "@household/domain";
import { isSnapserveLive } from "@household/integrations";

const householdOf = (store: HouseholdStore) => store.getState().households[0]?.id ?? "hh_demo_001";

/** The member whose phone may place orders: the owner, else the first member. */
export function orderingMember(store: HouseholdStore) {
  const householdId = householdOf(store);
  const members = store.getState().members.filter((m) => m.householdId === householdId);
  return members.find((m) => m.role === "OWNER") ?? members[0] ?? null;
}

export function registerStoreRoutes(app: FastifyInstance, store: HouseholdStore) {
  const vendorsOf = () => {
    const householdId = householdOf(store);
    return store.getState().vendors.filter((v) => v.householdId === householdId);
  };

  const phoneOr400 = (raw: string, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    const phone = normalizePhoneE164(raw);
    if (!phone) reply.code(400).send({ error: "Enter a valid phone number, e.g. 98400 12345 or +91 98400 12345." });
    return phone;
  };

  app.get("/api/vendors", async () => ({ vendors: vendorsOf() }));

  app.post("/api/vendors", async (request, reply) => {
    const input = StoreInputSchema.parse(request.body ?? {});
    const phoneE164 = phoneOr400(input.phone, reply);
    if (!phoneE164) return;
    if (vendorsOf().some((v) => v.phoneE164 === phoneE164)) {
      return reply.code(409).send({ error: "A store with this phone number is already added." });
    }
    const householdId = householdOf(store);
    const vendor: Vendor = {
      id: `vnd_${crypto.randomUUID().slice(0, 8)}`,
      householdId,
      name: input.name,
      category: input.categories[0],
      categories: input.categories,
      phoneE164,
      // A household's first store is its default.
      isPreferred: input.isPreferred || vendorsOf().length === 0,
    };
    store.mutate(
      (draft) => {
        if (vendor.isPreferred) for (const v of draft.vendors) if (v.householdId === householdId) v.isPreferred = false;
        draft.vendors.push(vendor);
      },
      { householdId, actor: "user", operation: "VENDOR_ADDED", entityType: "Vendor", entityId: vendor.id },
    );
    return reply.code(201).send({ vendor });
  });

  app.patch("/api/vendors/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = StoreUpdateSchema.parse(request.body ?? {});
    if (!vendorsOf().some((v) => v.id === id)) return reply.code(404).send({ error: "Store not found." });
    let phoneE164: string | undefined;
    if (input.phone !== undefined) {
      const p = phoneOr400(input.phone, reply);
      if (!p) return;
      phoneE164 = p;
    }
    const householdId = householdOf(store);
    const vendor = store.mutate(
      (draft) => {
        if (input.isPreferred) for (const v of draft.vendors) if (v.householdId === householdId) v.isPreferred = false;
        const v = draft.vendors.find((x) => x.id === id && x.householdId === householdId);
        if (!v) return null;
        if (input.name !== undefined) v.name = input.name;
        if (phoneE164) v.phoneE164 = phoneE164;
        if (input.categories) {
          v.categories = input.categories;
          v.category = input.categories[0];
        }
        if (input.isPreferred !== undefined) v.isPreferred = input.isPreferred;
        return v;
      },
      { householdId, actor: "user", operation: "VENDOR_UPDATED", entityType: "Vendor", entityId: id },
    );
    return { vendor };
  });

  app.delete("/api/vendors/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!vendorsOf().some((v) => v.id === id)) return reply.code(404).send({ error: "Store not found." });
    const householdId = householdOf(store);
    store.mutate(
      (draft) => {
        const removed = draft.vendors.find((v) => v.id === id && v.householdId === householdId);
        draft.vendors = draft.vendors.filter((v) => v !== removed);
        // Keep a default store if the default one was removed.
        const rest = draft.vendors.filter((v) => v.householdId === householdId);
        if (removed?.isPreferred && rest[0] && !rest.some((v) => v.isPreferred)) rest[0].isPreferred = true;
      },
      { householdId, actor: "user", operation: "VENDOR_REMOVED", entityType: "Vendor", entityId: id },
    );
    return { ok: true };
  });

  app.get("/api/ordering", async (): Promise<OrderingSetup> => ({
    agentNumber: process.env.SNAPSERVE_ORDER_NUMBER?.trim() || null,
    ownerPhone: orderingMember(store)?.phoneE164 ?? null,
    live: isSnapserveLive() && Boolean(process.env.SNAPSERVE_ORDER_AGENT_ID?.trim()),
    storeCount: vendorsOf().length,
  }));

  app.put("/api/ordering/phone", async (request, reply) => {
    const input = OrderingPhoneInputSchema.parse(request.body ?? {});
    const phoneE164 = phoneOr400(input.phone, reply);
    if (!phoneE164) return;
    const member = orderingMember(store);
    if (!member) return reply.code(409).send({ error: "This household has no members yet." });
    const householdId = householdOf(store);
    store.mutate(
      (draft) => {
        const m = draft.members.find((x) => x.id === member.id);
        if (m) {
          m.phoneE164 = phoneE164;
          m.phone = phoneE164;
        }
      },
      { householdId, actor: "user", operation: "ORDERING_PHONE_SET", entityType: "Member", entityId: member.id },
    );
    return { ownerPhone: phoneE164 };
  });
}
