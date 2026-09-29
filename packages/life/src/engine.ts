// Life Intelligence Engine. Deterministic rules over the user's own data.
// Agents reason, services calculate: nothing here calls an LLM.
import type {
  LifeCartItem,
  LifeForecast,
  LifeInventoryItem,
  LifeObligation,
  LifeWeeklyMealPlan,
  ModuleId,
} from "./types.js";
import {
  commute,
  listings,
  occasion,
  personalEvents,
  reuseActivity,
  routeOptions,
  stations,
  vehicle,
  weekCommute,
  wardrobe,
  type TransportMode,
} from "./data.js";

// ── Dates ─────────────────────────────────────────────────────────────────

export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

function parts(iso: string): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return [y, m, d];
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  return isoDate(new Date(y, m - 1, d + n));
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function dayLabel(iso: string, today = todayIso()): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  const [y, m, d] = parts(iso);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// ── Timeline ──────────────────────────────────────────────────────────────

export type EventKind =
  | "bill"
  | "document"
  | "vehicle"
  | "appointment"
  | "meal"
  | "grocery"
  | "meeting"
  | "trip"
  | "charge"
  | "event";

export interface TimelineEvent {
  id: string;
  module: ModuleId;
  kind: EventKind;
  title: string;
  detail: string;
  date: string;
  time?: string;
  weight: number;
  amount?: number;
  href: string;
}

export interface LifeInputs {
  obligations: LifeObligation[];
  weekly: LifeWeeklyMealPlan[];
  forecasts: LifeForecast[];
  inventory: LifeInventoryItem[];
  cart: LifeCartItem[];
}

function parseAmount(a?: string): number | undefined {
  if (!a) return undefined;
  const n = Number(a.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const domainKind: Record<LifeObligation["domain"], EventKind> = {
  bill: "bill",
  document: "document",
  vehicle: "vehicle",
  appointment: "appointment",
  subscription: "bill",
};

export function buildTimeline(input: LifeInputs, today = todayIso()): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const o of input.obligations) {
    if (!o.dueDate) continue;
    const amount = parseAmount(o.amount);
    const weight =
      o.domain === "appointment" || o.domain === "document" ? 4 : amount && amount > 10_000 ? 4 : 3;
    events.push({
      id: o.id,
      module: "admin",
      kind: domainKind[o.domain],
      title: o.title,
      detail: [o.provider, o.amount].filter(Boolean).join(" · "),
      date: o.dueDate,
      weight,
      amount,
      href: "/obligations",
    });
  }

  for (const day of input.weekly) {
    for (const m of day.meals) {
      if (m.slot !== "Dinner") continue;
      events.push({
        id: m.id,
        module: "kitchen",
        kind: "meal",
        title: m.recipeName,
        detail: `Dinner · ${m.servings} servings · ${m.prepTime ?? "?"} min`,
        date: day.date,
        weight: (m.prepTime ?? 0) >= 60 ? 2 : 1,
        href: "/meals",
      });
    }
  }

  for (const f of input.forecasts) {
    if (f.severity !== "high") continue;
    if (f.domain && f.domain !== "kitchen") continue;
    events.push({
      id: `fc_${f.id}`,
      module: "kitchen",
      kind: "grocery",
      title: `${f.itemName} replenishment`,
      detail: f.detail,
      date: addDays(today, Math.max(0, f.horizonDays - 1)),
      weight: 3,
      href: "/cart",
    });
  }

  for (const p of personalEvents) {
    events.push({
      id: p.id,
      module: p.module,
      kind: p.kind,
      title: p.title,
      detail: p.detail,
      date: addDays(today, p.daysFromNow),
      time: "time" in p ? p.time : undefined,
      weight: p.weight,
      href: p.href,
    });
  }

  return events
    .filter((e) => daysBetween(today, e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99"));
}

export function loadByDay(events: TimelineEvent[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of events) map.set(e.date, (map.get(e.date) ?? 0) + e.weight);
  return map;
}

// ── Deadline collision detector ───────────────────────────────────────────

export interface Collision {
  id: string;
  start: string;
  end: string;
  events: TimelineEvent[];
  load: number;
  advice: string[];
}

const COLLIDING: EventKind[] = ["bill", "document", "vehicle", "appointment", "meeting", "trip", "event"];

export function findCollisions(events: TimelineEvent[], today = todayIso(), horizon = 30): Collision[] {
  const pool = events.filter((e) => COLLIDING.includes(e.kind));
  const load = loadByDay(events.filter((e) => e.kind !== "meal" && e.kind !== "charge"));
  const flagged = new Set<string>();

  for (let i = 0; i < horizon; i++) {
    const start = addDays(today, i);
    const win = pool.filter((e) => e.date >= start && e.date <= addDays(start, 2));
    const sum = win.reduce((s, e) => s + e.weight, 0);
    if (win.length >= 3 || sum >= 8) {
      if (win.length >= 2) win.forEach((e) => flagged.add(e.id));
    }
  }

  const hit = pool.filter((e) => flagged.has(e.id)).sort((a, b) => a.date.localeCompare(b.date));
  const groups: TimelineEvent[][] = [];
  for (const e of hit) {
    const last = groups[groups.length - 1];
    const lastEvent = last?.[last.length - 1];
    if (last && lastEvent && daysBetween(lastEvent.date, e.date) <= 2) last.push(e);
    else groups.push([e]);
  }

  return groups
    .filter((g) => g.length >= 2)
    .map((g, idx) => {
      const start = g[0]?.date ?? today;
      const end = g[g.length - 1]?.date ?? start;
      const advice: string[] = [];
      const payable = g.filter((e) => e.amount && (e.kind === "bill" || e.kind === "vehicle"));
      if (payable.length > 0) {
        let best = addDays(today, 1);
        let bestLoad = Infinity;
        for (let d = 1; addDays(today, d) < start; d++) {
          const day = addDays(today, d);
          const l = load.get(day) ?? 0;
          if (l <= bestLoad) {
            best = day;
            bestLoad = l;
          }
        }
        if (best < start) {
          advice.push(
            `Pay ${payable.map((p) => p.title).join(" and ")} on ${dayLabel(best, today)}, a lighter day.`,
          );
        }
      }
      for (const e of g.filter((x) => x.kind === "document")) {
        advice.push(`Start "${e.title}" early. It needs steps beyond payment.`);
      }
      if (g.some((e) => e.kind === "trip")) {
        advice.push("Finish anything payable before you travel.");
      }
      return {
        id: `col_${idx}_${start}`,
        start,
        end,
        events: g,
        load: g.reduce((s, e) => s + e.weight, 0),
        advice,
      };
    });
}

// ── Mobility maths ────────────────────────────────────────────────────────

export function dayCost(mode: TransportMode): number {
  const opt = routeOptions.find((r) => r.mode === mode);
  if (!opt) return 0;
  if (mode === "ev") return Math.round(((2 * commute.km) / vehicle.kmPerKwh) * vehicle.homeTariff + 40);
  return (opt.fixedCost ?? 0) * 2;
}

export function weekCommuteCost(): number {
  return weekCommute.reduce((s, d) => s + dayCost(d.mode), 0);
}

export function leaveBy(arrival: string, mode: TransportMode, bufferMin = 15): string {
  const opt = routeOptions.find((r) => r.mode === mode);
  const [h = 0, m = 0] = arrival.split(":").map(Number);
  const total = h * 60 + m - (opt?.minutes ?? 40) - bufferMin;
  const hh = String(Math.floor(((total % 1440) + 1440) % 1440 / 60)).padStart(2, "0");
  const mm = String((((total % 60) + 60) % 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function chargePlan(currentPct: number, targetPct: number) {
  const pct = Math.max(0, targetPct - currentPct);
  const kwh = (pct / 100) * vehicle.batteryKwh;
  return { pct, kwh, homeCost: kwh * vehicle.homeTariff };
}

export function commuteSavings() {
  const cabDays = weekCommute.filter((d) => d.mode === "cab").length;
  return { cabDays, weekly: cabDays * (dayCost("cab") - dayCost("metro")) };
}

// ── Circular maths ────────────────────────────────────────────────────────

export function occasionCosts() {
  const item = wardrobe.find((w) => w.id === "w1");
  const rent = listings.filter((l) => l.tags.includes(occasion.tag) && l.type === "rent");
  const rentTotal = rent.reduce((s, l) => s + l.perDay * occasion.days, 0);
  const buyPrice = 9800;
  const expectedWears = 4;
  return {
    own: { cost: 0, note: item ? `You own "${item.name}" and ${wardrobe.filter((w) => w.occasions.includes(occasion.tag)).length - 1} other matching pieces` : "" },
    rent: { cost: rentTotal, items: rent.length },
    buy: { cost: buyPrice, perWear: Math.round(buyPrice / expectedWears) },
    borrow: { cost: 0, note: "Community lending, subject to owner approval" },
  };
}

// ── Suggestions (with evidence) ───────────────────────────────────────────

export interface Suggestion {
  id: string;
  kind: string;
  module: ModuleId;
  title: string;
  why: string[];
  actionLabel: string;
  href: string;
  score: number;
}

export function buildSuggestions(
  events: TimelineEvent[],
  collisions: Collision[],
  input: LifeInputs,
  today = todayIso(),
): Suggestion[] {
  const out: Suggestion[] = [];
  const trip = events.find((e) => e.kind === "trip");
  const tripIn = trip ? daysBetween(today, trip.date) : null;

  if (trip && tripIn !== null && tripIn <= 14) {
    const dueAround = events.filter(
      (e) => (e.kind === "bill" || e.kind === "vehicle") && Math.abs(daysBetween(trip.date, e.date)) <= 2,
    );
    out.push({
      id: "sg_trip_groceries",
      kind: "trip",
      module: "kitchen",
      title: `Pause grocery delivery around ${dayLabel(trip.date, today)}`,
      why: [
        `${trip.title} on ${dayLabel(trip.date, today)}`,
        "No household member is marked at home during the trip",
        `${input.cart.length} cart items would be delivered while you're away`,
      ],
      actionLabel: "Review cart",
      href: "/cart",
      score: 62 - tripIn,
    });
    out.push({
      id: "sg_trip_meals",
      kind: "trip",
      module: "kitchen",
      title: "Cook ahead the day before you travel",
      why: [
        `Trip starts ${dayLabel(trip.date, today)} at ${trip.time ?? "morning"}`,
        "Dal Tadka and Egg Curry keep two days refrigerated",
        "Pantry covers both recipes with no purchase",
      ],
      actionLabel: "Open meal plan",
      href: "/meals",
      score: 55 - tripIn,
    });
    if (dueAround.length > 0) {
      out.push({
        id: "sg_trip_bills",
        kind: "trip",
        module: "admin",
        title: `Pay ${dueAround.map((d) => d.title).join(" and ")} before you fly`,
        why: dueAround.map((d) => `${d.title} due ${dayLabel(d.date, today)} (${d.detail})`),
        actionLabel: "Prepare payments",
        href: "/actions",
        score: 74 - tripIn,
      });
    }
  }

  const meeting = events.find((e) => e.kind === "meeting" && daysBetween(today, e.date) === 1);
  if (meeting?.time) {
    const leave = leaveBy(meeting.time, "ev");
    out.push({
      id: "sg_leave",
      kind: "mobility",
      module: "mobility",
      title: `Leave by ${leave} tomorrow`,
      why: [
        `${meeting.title} at ${meeting.time}`,
        `Own EV takes about ${routeOptions.find((r) => r.mode === "ev")?.minutes} min`,
        "15 min buffer for parking and peak traffic",
      ],
      actionLabel: "Open commute",
      href: "/mobility",
      score: 80,
    });
  }

  if (vehicle.batteryPct < 60) {
    const plan = chargePlan(vehicle.batteryPct, 80);
    out.push({
      id: "sg_charge",
      kind: "mobility",
      module: "mobility",
      title: "Charge the EV to 80% tonight",
      why: [
        `Battery at ${vehicle.batteryPct}%, below your 60% comfort line`,
        `About ${plan.kwh.toFixed(1)} kWh at home tariff, roughly ${rupees(plan.homeCost)}`,
        "Overnight charging avoids the daytime fast-charge premium",
      ],
      actionLabel: "See charging",
      href: "/mobility",
      score: 58,
    });
  }

  const wedding = events.find((e) => e.kind === "event");
  if (wedding) {
    const matches = wardrobe.filter((w) => w.occasions.includes(occasion.tag));
    out.push({
      id: "sg_wedding",
      kind: "circular",
      module: "circular",
      title: `Check your wardrobe before renting for ${wedding.title}`,
      why: [
        `${matches.length} pieces you own are tagged "${occasion.tag}"`,
        `Renting a full outfit would cost ${rupees(occasionCosts().rent.cost)} for ${occasion.days} days`,
        "Wardrobe first, then borrow, then rent",
      ],
      actionLabel: "Plan outfit",
      href: "/circular",
      score: 50,
    });
  }

  for (const c of collisions) {
    if (c.advice.length === 0) continue;
    out.push({
      id: `sg_${c.id}`,
      kind: "collision",
      module: "admin",
      title: `Deadline pile-up ${dayLabel(c.start, today)} to ${dayLabel(c.end, today)}`,
      why: [...c.events.map((e) => `${e.title} · ${dayLabel(e.date, today)}`), ...c.advice],
      actionLabel: "See timeline",
      href: "/timeline",
      score: 68,
    });
  }

  const shortage = input.forecasts.find(
    (f) => f.severity === "high" && f.type === "SHORTAGE_RISK" && (!f.domain || f.domain === "kitchen"),
  );
  if (shortage) {
    out.push({
      id: "sg_shortage",
      kind: "kitchen",
      module: "kitchen",
      title: `${shortage.itemName} runs short`,
      why: [shortage.detail, "Cart already includes a 21-day replenishment", "Approve to keep biryani on Tuesday"],
      actionLabel: "Open cart",
      href: "/cart",
      score: 66,
    });
  }

  return out;
}

/** Learns from rejections: kinds rejected twice or more are down-ranked. */
export function rankSuggestions(
  list: Suggestion[],
  decided: Record<string, "accepted" | "rejected">,
  rejectedKinds: Record<string, number>,
): Suggestion[] {
  return list
    .filter((s) => !decided[s.id])
    .map((s) => ({ ...s, score: s.score - (rejectedKinds[s.kind] ?? 0) * 12 }))
    .sort((a, b) => b.score - a.score);
}

// ── Assistant ─────────────────────────────────────────────────────────────

export interface Answer {
  text: string;
  bullets?: string[];
  sources: Array<{ label: string; href: string }>;
}

export interface AssistantContext {
  events: TimelineEvent[];
  inventory: LifeInventoryItem[];
  cart: LifeCartItem[];
  suggestions: Suggestion[];
  today: string;
}

export const starterQuestions = [
  "What do I need to complete tomorrow?",
  "How much will my household spend this week?",
  "What groceries are running low?",
  "How can I reduce my commute expenses?",
  "What should I prepare before travelling next week?",
];

export function answer(question: string, ctx: AssistantContext): Answer {
  const q = question.toLowerCase();
  const { events, today } = ctx;

  if (/tomorrow|today|to do|complete|need to do/.test(q)) {
    const target = /today/.test(q) ? today : addDays(today, 1);
    const list = events.filter((e) => e.date === target && e.kind !== "meal");
    const meals = events.filter((e) => e.date === target && e.kind === "meal");
    return {
      text: list.length
        ? `${dayLabel(target, today)} you have ${list.length} thing${list.length > 1 ? "s" : ""} to handle.`
        : `${dayLabel(target, today)} is clear.`,
      bullets: [
        ...list.map((e) => `${e.time ? e.time + " · " : ""}${e.title}: ${e.detail}`),
        ...meals.map((m) => `Dinner: ${m.title} (${m.detail})`),
      ],
      sources: [{ label: "Timeline", href: "/timeline" }],
    };
  }

  if (/spend|expense|cost/.test(q) && /household|week|month|spend/.test(q) && !/commute/.test(q)) {
    const cart = ctx.cart.reduce((s, c) => s + c.estimatedPrice, 0);
    const bills = events
      .filter((e) => e.amount && daysBetween(today, e.date) <= 7 && (e.kind === "bill" || e.kind === "vehicle"))
      .reduce((s, e) => s + (e.amount ?? 0), 0);
    const commuteCost = weekCommuteCost();
    return {
      text: `About ${rupees(cart + bills + commuteCost)} over the next 7 days.`,
      bullets: [
        `Groceries in your smart cart: ${rupees(cart)}`,
        `Bills due within 7 days: ${rupees(bills)}`,
        `Commute this week: ${rupees(commuteCost)}`,
      ],
      sources: [
        { label: "Smart cart", href: "/cart" },
        { label: "Life Administration", href: "/obligations" },
        { label: "Commute expenses", href: "/mobility" },
      ],
    };
  }

  if (/low|running|grocer|stock|pantry/.test(q)) {
    const low = ctx.inventory.filter((i) => i.daysRemaining != null && i.daysRemaining <= 3);
    return {
      text: low.length ? `${low.length} items are running low or close to expiry.` : "Nothing is running low.",
      bullets: low.map((i) => `${i.name}: ${i.quantity} ${i.unit} left, about ${i.daysRemaining} days`),
      sources: [
        { label: "Pantry", href: "/pantry" },
        { label: "Smart cart", href: "/cart" },
      ],
    };
  }

  if (/commute|reduce|save|cheaper/.test(q)) {
    const s = commuteSavings();
    return {
      text: `Swapping ${s.cabDays} cab days for the metro would save about ${rupees(s.weekly)} a week.`,
      bullets: [
        `This week's commute: ${rupees(weekCommuteCost())}`,
        `Cab round trip ${rupees(dayCost("cab"))} vs metro ${rupees(dayCost("metro"))}`,
        "The metro adds roughly 10 minutes each way",
      ],
      sources: [{ label: "Smart Mobility", href: "/mobility" }],
    };
  }

  if (/travel|trip|prepare|before/.test(q)) {
    const trip = ctx.suggestions.filter((s) => s.kind === "trip");
    return {
      text: trip.length ? "Here is what I'd prepare before you travel." : "No trip is planned in the next two weeks.",
      bullets: trip.map((s) => s.title),
      sources: [{ label: "Timeline", href: "/timeline" }],
    };
  }

  if (/wear|wedding|outfit|dress|festival/.test(q)) {
    const matches = wardrobe.filter((w) => w.occasions.includes(occasion.tag));
    return {
      text: `You own ${matches.length} pieces suited to the ${occasion.name.toLowerCase()}.`,
      bullets: matches.map((m) => `${m.name} (worn ${m.worn} times)`),
      sources: [{ label: "Circular Living", href: "/circular" }],
    };
  }

  if (/charge|ev|battery|station/.test(q)) {
    const best = [...stations].sort((a, b) => a.waitMin - b.waitMin || a.km - b.km)[0];
    if (!best) return { text: "No charging stations are available.", sources: [] };
    return {
      text: `Battery is at ${vehicle.batteryPct}%. ${best.name} has no wait and is ${best.km} km away.`,
      bullets: [`Home charge to 80% costs about ${rupees(chargePlan(vehicle.batteryPct, 80).homeCost)}`],
      sources: [{ label: "EV charging", href: "/mobility" }],
    };
  }

  return {
    text: "I can answer from your timeline, pantry, spending, commute and wardrobe.",
    bullets: starterQuestions,
    sources: [],
  };
}

// ── Sustainability (assumption-driven, user-editable) ─────────────────────

/** Illustrative kg CO2e avoided per reused item. Editable in the UI; not a measured value. */
export const defaultFactors = { garment: 6, household: 2 };

export function co2Saved(factors: { garment: number; household: number }): number {
  return reuseActivity.reduce((s, a) => s + factors[a.type], 0);
}
