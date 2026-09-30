// LifeService: the single implementation behind /api/life, /api/mobility,
// /api/circular, /api/notifications and /api/plans. The API keeps one instance
// per household; the web app runs an identical instance only as an offline
// fallback, so behaviour never diverges between the two.
import {
  addDays,
  answer,
  buildSuggestions,
  buildTimeline,
  chargePlan,
  co2Saved,
  commuteSavings,
  daysBetween,
  dayCost,
  dayLabel,
  defaultFactors,
  findCollisions,
  leaveBy,
  rankSuggestions,
  starterQuestions,
  todayIso,
  weekCommuteCost,
  type Answer,
  type LifeInputs,
} from "./engine.js";
import {
  commute,
  listings as baseListings,
  notices,
  occasion,
  plans,
  reuseActivity,
  ridePools,
  routeOptions,
  stations,
  tripContacts,
  vehicle,
  wardrobe as baseWardrobe,
  weekCommute,
  type Listing,
  type ListingType,
  type TransportMode,
  type WardrobeCategory,
  type WardrobeItem,
} from "./data.js";
import { RECIPE_SERVINGS, ingredientBase, matchesKey, recipeCatalog, recipeImageUrl } from "./recipe-catalog.js";
import type { ModuleId } from "./types.js";

export type Decision = "accepted" | "rejected";

export interface LifeState {
  decided: Record<string, Decision>;
  rejectedKinds: Record<string, number>;
  read: string[];
  applied: string[];
  sharing: string[];
  requested: string[];
  wardrobeExtra: WardrobeItem[];
  listingsExtra: Listing[];
  factors: { garment: number; household: number };
  scopes: Record<ModuleId, boolean>;
  seq: number;
}

export function defaultLifeState(): LifeState {
  return {
    decided: {},
    rejectedKinds: {},
    read: [],
    applied: [],
    sharing: [],
    requested: [],
    wardrobeExtra: [],
    listingsExtra: [],
    factors: { ...defaultFactors },
    scopes: { kitchen: true, personal: true, admin: false, mobility: false, circular: false },
    seq: 0,
  };
}

type Need = "Ethnic" | "Accessory";
const NEEDS: Need[] = ["Ethnic", "Accessory"];
/** Assumed purchase prices for a comparable new item. Not a quote. */
const BUY_PRICE: Record<Need, number> = { Ethnic: 9800, Accessory: 3500 };
const LISTING_CATEGORY: Record<Need, Listing["category"]> = { Ethnic: "Clothing", Accessory: "Accessory" };
const SWATCHES = ["bg-[#8B2E3B]", "bg-[#22345A]", "bg-[#2A8C86]", "bg-[#C79A55]", "bg-[#8FAE8B]", "bg-[#DC6A52]"];

export interface SearchHit {
  id: string;
  label: string;
  hint: string;
  group: string;
  module?: ModuleId;
  to: string;
}

export class LifeService {
  constructor(
    private readonly getInputs: () => LifeInputs,
    public state: LifeState = defaultLifeState(),
  ) {}

  private core() {
    const today = todayIso();
    const inputs = this.getInputs();
    const events = buildTimeline(inputs, today);
    const collisions = findCollisions(events, today);
    const all = buildSuggestions(events, collisions, inputs, today);
    return { today, inputs, events, collisions, all };
  }

  // ── Intelligence ────────────────────────────────────────────────────────

  overview() {
    const { today, events, collisions, all } = this.core();
    const suggestions = rankSuggestions(all, this.state.decided, this.state.rejectedKinds);
    return {
      today,
      events,
      collisions: collisions.map((c) => ({ ...c, applied: this.state.applied.includes(c.id) })),
      suggestions,
      rejections: Object.values(this.state.rejectedKinds).reduce((s, n) => s + n, 0),
    };
  }

  decide(id: string, kind: string, decision: Decision) {
    this.state.decided[id] = decision;
    if (decision === "rejected") {
      this.state.rejectedKinds[kind] = (this.state.rejectedKinds[kind] ?? 0) + 1;
    }
  }

  resetLearning() {
    this.state.decided = {};
    this.state.rejectedKinds = {};
  }

  setCollisionApplied(id: string, on: boolean) {
    const has = this.state.applied.includes(id);
    if (on && !has) this.state.applied.push(id);
    if (!on && has) this.state.applied = this.state.applied.filter((x) => x !== id);
  }

  ask(question: string): Answer {
    const { today, events, inputs, all } = this.core();
    const suggestions = rankSuggestions(all, this.state.decided, this.state.rejectedKinds);
    return answer(question, { events, inventory: inputs.inventory, cart: inputs.cart, suggestions, today });
  }

  starters() {
    return starterQuestions;
  }

  /**
   * Recipe catalogue scaled to `servings`. Pantry coverage is worked out here
   * (quantity-aware, from the live inventory), never in the UI.
   */
  recipes(servings = RECIPE_SERVINGS) {
    const stock = this.getInputs().inventory.map((i) => {
      const unit = i.unit.toLowerCase();
      const kind = unit === "kg" || unit === "g" ? "mass" : unit === "l" || unit === "ml" ? "volume" : "count";
      const factor = unit === "kg" || unit === "l" ? 1000 : 1;
      return { name: i.name, kind, base: i.quantity * factor };
    });
    const round = (n: number) => Math.round(n * 100) / 100;

    return recipeCatalog.map((r) => {
      const ingredients = r.ingredients.map((ing) => {
        const need = ingredientBase(ing, servings);
        const shown = round(ing.qty * servings);
        if (!ing.key) {
          return { name: ing.name, quantity: shown, unit: ing.unit, tracked: false, available: null, enough: true, shortBy: 0 };
        }
        const key = ing.key;
        const matches = stock.filter((s) => s.base > 0 && matchesKey(key, s.name));
        // Mass and volume compare directly (1 g ~ 1 ml); count vs weight cannot be compared, so presence is enough.
        const comparable = matches.filter((m) => (m.kind === "count") === (need.kind === "count") || need.kind === "either");
        if (matches.length === 0) {
          return { name: ing.name, quantity: shown, unit: ing.unit, tracked: true, available: 0, enough: false, shortBy: shown };
        }
        if (comparable.length === 0 || need.kind === "either") {
          return { name: ing.name, quantity: shown, unit: ing.unit, tracked: true, available: null, enough: true, shortBy: 0 };
        }
        const haveBase = comparable.reduce((sum, m) => sum + m.base, 0);
        const perUnit = need.qty / (shown || 1);
        const enough = haveBase >= need.qty;
        return {
          name: ing.name,
          quantity: shown,
          unit: ing.unit,
          tracked: true,
          available: round(haveBase / perUnit),
          enough,
          shortBy: enough ? 0 : round((need.qty - haveBase) / perUnit),
        };
      });
      const missing = ingredients.filter((i) => !i.enough).map((i) => i.name);
      return {
        id: r.id,
        name: r.name,
        blurb: r.blurb,
        region: r.region,
        course: r.course,
        veg: r.veg,
        prepMin: r.prepMin,
        cookMin: r.cookMin,
        difficulty: r.difficulty,
        servings,
        image: recipeImageUrl(r.image),
        ingredients,
        steps: r.steps,
        missing,
        canMakeNow: missing.length === 0,
      };
    });
  }

  /** Compact, deterministic snapshot of the household handed to the language model as its only source of facts. */
  assistantContext() {
    const { today, events, inputs, all } = this.core();
    const suggestions = rankSuggestions(all, this.state.decided, this.state.rejectedKinds);
    const cartTotal = inputs.cart.reduce((sum, c) => sum + c.estimatedPrice, 0);
    const billsDue7 = events
      .filter((e) => e.amount && (e.kind === "bill" || e.kind === "vehicle") && daysBetween(today, e.date) <= 7)
      .reduce((sum, e) => sum + (e.amount ?? 0), 0);
    const sample = inputs.samples !== false;
    const commuteWeek = sample ? weekCommuteCost() : 0;
    return {
      today,
      spendNext7Days: {
        groceriesInSmartCart: cartTotal,
        billsDue: billsDue7,
        commute: commuteWeek,
        total: cartTotal + billsDue7 + commuteWeek,
      },
      upcomingEvents: events
        .filter((e) => daysBetween(today, e.date) <= 14)
        .map((e) => ({ date: e.date, time: e.time, kind: e.kind, title: e.title, detail: e.detail, amount: e.amount })),
      pantry: inputs.inventory.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        daysRemaining: i.daysRemaining ?? null,
      })),
      smartCart: inputs.cart.map((c) => ({ name: c.name, quantity: c.quantity, unit: c.unit, estimatedPrice: c.estimatedPrice, reason: c.reason })),
      obligations: inputs.obligations.map((o) => ({
        title: o.title,
        provider: o.provider,
        status: o.status,
        dueDate: o.dueDate,
        amount: o.amount,
        detail: o.detail,
      })),
      forecasts: inputs.forecasts.map((f) => ({ item: f.itemName, type: f.type, severity: f.severity, inDays: f.horizonDays, detail: f.detail })),
      suggestions: suggestions.slice(0, 8).map((s) => ({ kind: s.kind, title: s.title })),
      cookableNow: this.recipes()
        .filter((r) => r.canMakeNow)
        .map((r) => r.name)
        .slice(0, 20),
      // The mobility and wardrobe profiles are built-in samples; a household that
      // starts empty must not have the assistant quote them as its own.
      ...(sample
        ? {
            summary: this.summary(),
            mobility: (({ commute: c, vehicle: v, routes, week, weekTotal, savings, stations: st }) => ({
              commute: c,
              vehicle: v,
              routes,
              week,
              weekTotal,
              savings,
              nearestStations: st.slice(0, 3),
            }))(this.mobility()),
            wardrobe: this.closet().map((w) => ({ name: w.name, occasions: w.occasions, worn: w.worn })),
          }
        : {}),
    };
  }

  summary() {
    const { today, events, inputs } = this.core();
    const low = inputs.inventory.filter((i) => i.daysRemaining != null && i.daysRemaining <= 3).length;
    const dinner = events.find((e) => e.kind === "meal");
    const attention = inputs.obligations.filter((o) => o.status !== "ok").length;
    const billsDue14 = events
      .filter((e) => e.amount && (e.kind === "bill" || e.kind === "vehicle") && daysBetween(today, e.date) <= 14)
      .reduce((s, e) => s + (e.amount ?? 0), 0);
    const wardrobeMatches = this.closet().filter((w) => w.occasions.includes(occasion.tag)).length;
    return {
      kitchen: { lowCount: low, dinner: dinner?.title ?? null },
      admin: { attention, billsDue14 },
      mobility: {
        leaveBy: leaveBy(commute.meetingTomorrow.time, "ev"),
        batteryPct: vehicle.batteryPct,
        weekCost: weekCommuteCost(),
      },
      circular: { wardrobeMatches, co2Saved: co2Saved(this.state.factors) },
    };
  }

  search(q: string): SearchHit[] {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const { today, events, inputs } = this.core();
    const hits: SearchHit[] = [];
    for (const e of events)
      hits.push({ id: `ev:${e.id}`, label: e.title, hint: `${dayLabel(e.date, today)} · ${e.detail}`, group: "Timeline", module: e.module, to: e.href });
    for (const i of inputs.inventory)
      hits.push({ id: `inv:${i.id}`, label: i.name, hint: `${i.quantity} ${i.unit} in pantry`, group: "Pantry", module: "kitchen", to: "/pantry" });
    for (const w of this.closet())
      hits.push({ id: `wd:${w.id}`, label: w.name, hint: `Wardrobe · ${w.category}`, group: "Wardrobe", module: "circular", to: "/circular" });
    for (const l of this.market())
      hits.push({ id: `ls:${l.id}`, label: l.title, hint: `${l.type} · ${l.km} km`, group: "Sharing", module: "circular", to: "/circular" });
    for (const s of stations)
      hits.push({ id: `cs:${s.id}`, label: s.name, hint: `EV charging · ${s.km} km`, group: "EV charging", module: "mobility", to: "/mobility" });
    for (const n of this.activeNotices())
      hits.push({ id: `nt:${n.id}`, label: n.title, hint: n.detail, group: "Notifications", module: n.module, to: n.href });
    return hits.filter((h) => `${h.label} ${h.hint}`.toLowerCase().includes(term)).slice(0, 24);
  }

  // ── Notifications ───────────────────────────────────────────────────────

  /** The built-in sample notices, or none for a household that starts empty. */
  private activeNotices(): typeof notices {
    return this.getInputs().samples === false ? [] : notices;
  }

  notifications() {
    const map = new Map<string, typeof notices>();
    for (const n of this.activeNotices()) map.set(n.group, [...(map.get(n.group) ?? []), n]);
    const groups = [...map.entries()]
      .map(([title, items]) => ({
        title,
        items: items.map((i) => ({ ...i, read: this.state.read.includes(i.id) })),
        unread: items.filter((i) => !this.state.read.includes(i.id)).length,
        newestMinutes: Math.min(...items.map((i) => i.minutesAgo)),
      }))
      .sort((a, b) => a.newestMinutes - b.newestMinutes);
    return { groups, unread: groups.reduce((s, g) => s + g.unread, 0) };
  }

  markRead(ids: string[] | "all") {
    const target = ids === "all" ? this.activeNotices().map((n) => n.id) : ids;
    this.state.read = [...new Set([...this.state.read, ...target])];
  }

  // ── Mobility ────────────────────────────────────────────────────────────

  mobility() {
    const savings = commuteSavings();
    return {
      commute,
      vehicle: { ...vehicle, rangeKm: Math.round((vehicle.batteryPct / 100) * vehicle.rangeKmAtFull) },
      routes: routeOptions.map((r) => ({
        ...r,
        roundTripCost: dayCost(r.mode),
        co2Kg: Math.round(((r.gramsPerKm * commute.km * 2) / 1000) * 10) / 10,
      })),
      week: weekCommute.map((d) => ({ ...d, cost: dayCost(d.mode) })),
      weekTotal: weekCommuteCost(),
      savings,
      stations: [...stations].sort((a, b) => a.waitMin - b.waitMin || a.km - b.km),
      contacts: tripContacts,
      sharing: this.state.sharing,
      pools: ridePools,
      requested: this.state.requested,
    };
  }

  leaveBy(arrival: string, mode: TransportMode) {
    const opt = routeOptions.find((r) => r.mode === mode);
    return { leaveBy: leaveBy(arrival, mode), minutes: opt?.minutes ?? 0, bufferMin: 15 };
  }

  chargePlan(target: number) {
    const t = Math.min(100, Math.max(vehicle.batteryPct, Math.round(target)));
    return { target: t, ...chargePlan(vehicle.batteryPct, t) };
  }

  setTripSharing(contactId: string, on: boolean) {
    if (!tripContacts.some((c) => c.id === contactId)) return;
    const has = this.state.sharing.includes(contactId);
    if (on && !has) this.state.sharing.push(contactId);
    if (!on && has) this.state.sharing = this.state.sharing.filter((x) => x !== contactId);
  }

  setRideRequest(poolId: string, on: boolean) {
    if (!ridePools.some((p) => p.id === poolId)) return;
    const has = this.state.requested.includes(poolId);
    if (on && !has) this.state.requested.push(poolId);
    if (!on && has) this.state.requested = this.state.requested.filter((x) => x !== poolId);
  }

  // ── Circular ────────────────────────────────────────────────────────────

  private closet(): WardrobeItem[] {
    return [...baseWardrobe, ...this.state.wardrobeExtra];
  }

  private market(): Listing[] {
    return [...this.state.listingsExtra, ...baseListings];
  }

  circular() {
    return {
      wardrobe: this.closet(),
      listings: this.market(),
      occasion: { ...occasion, date: addDays(todayIso(), occasion.daysFromNow) },
      activity: reuseActivity,
      factors: this.state.factors,
      co2Saved: co2Saved(this.state.factors),
    };
  }

  addWardrobe(input: { name: string; category: WardrobeCategory; occasion: string }): WardrobeItem {
    this.state.seq += 1;
    const item: WardrobeItem = {
      id: `wx_${this.state.seq}`,
      name: input.name.trim(),
      category: input.category,
      swatch: SWATCHES[this.state.wardrobeExtra.length % SWATCHES.length] ?? "bg-accent",
      occasions: [input.occasion.toLowerCase()],
      worn: 0,
      price: 0,
    };
    this.state.wardrobeExtra.push(item);
    return item;
  }

  addListing(input: { title: string; type: ListingType; perDay: number }): Listing {
    this.state.seq += 1;
    const item: Listing = {
      id: `lx_${this.state.seq}`,
      title: input.title.trim(),
      type: input.type,
      perDay: input.type === "rent" ? Math.max(0, input.perDay) : 0,
      km: 0,
      owner: "You",
      verified: true,
      category: "Clothing",
      tags: [],
    };
    this.state.listingsExtra.unshift(item);
    return item;
  }

  occasionPlan(picked: Partial<Record<Need, string | null>>) {
    const closet = this.closet();
    const market = this.market();
    const plan = NEEDS.map((n) => {
      const id = picked[n] ?? null;
      const own = id ? closet.find((w) => w.id === id) ?? null : null;
      const rent =
        market
          .filter((l) => l.type === "rent" && l.category === LISTING_CATEGORY[n] && l.tags.includes(occasion.tag))
          .sort((a, b) => a.perDay - b.perDay)[0] ?? null;
      const borrow = market.find((l) => l.type === "lend" && l.category === LISTING_CATEGORY[n] && l.tags.includes(occasion.tag)) ?? null;
      return {
        need: n,
        matches: closet.filter((w) => w.category === n && w.occasions.includes(occasion.tag)),
        own,
        rent,
        borrow,
        rentCost: rent ? rent.perDay * occasion.days : null,
        buyCost: BUY_PRICE[n],
      };
    });
    const missing = plan.filter((p) => !p.own);
    const covered = missing.length === 0;
    const needed = covered ? plan : missing;
    const options = [
      { label: "Wardrobe", value: covered ? 0 : null, note: covered ? "Already yours" : "Pieces missing" },
      { label: "Borrow", value: needed.every((p) => p.borrow) ? 0 : null, note: "Owner must approve" },
      { label: "Rent", value: needed.reduce((s, p) => s + (p.rentCost ?? p.buyCost), 0), note: `${occasion.days} days` },
      { label: "Buy new", value: needed.reduce((s, p) => s + p.buyCost, 0), note: "Assumed price" },
    ];
    const values = options.map((o) => o.value).filter((v): v is number => v !== null);
    return { plan, options, covered, missingCount: missing.length, cheapest: values.length ? Math.min(...values) : null };
  }

  setFactors(f: { garment: number; household: number }) {
    const clamp = (n: number) => Math.min(20, Math.max(0, Number.isFinite(n) ? n : 0));
    this.state.factors = { garment: clamp(f.garment), household: clamp(f.household) };
  }

  // ── Household ───────────────────────────────────────────────────────────

  scopes() {
    return this.state.scopes;
  }

  setScope(module: ModuleId, on: boolean) {
    if (module in this.state.scopes) this.state.scopes[module] = on;
  }

  plans() {
    return plans;
  }
}
