// LIVORA AI sample data for modules without a backend yet (Mobility, Circular
// Living, personal events, notifications). Everything here is sample data and
// is labelled as such in the UI. No third-party integration is implied.

export const SAMPLE_NOTE = "Sample data. No external service is connected.";

// ── Mobility ──────────────────────────────────────────────────────────────

export type TransportMode = "metro" | "ev" | "bus" | "cab";

export interface RouteOption {
  mode: TransportMode;
  label: string;
  minutes: number;
  /** Rupees for one-way, computed for EV from vehicle params. */
  fixedCost?: number;
  comfort: 1 | 2 | 3 | 4 | 5;
  /** grams CO2e per km (illustrative assumption) */
  gramsPerKm: number;
  note: string;
}

export const commute = {
  from: "Home · Adyar",
  to: "Office · Guindy",
  km: 14,
  usualArrival: "09:30",
  meetingTomorrow: { title: "Quarterly review", time: "10:00" },
};

export const vehicle = {
  name: "Tata Nexon EV",
  batteryPct: 58,
  batteryKwh: 40.5,
  rangeKmAtFull: 300,
  kmPerKwh: 6.5,
  homeTariff: 8.5,
};

export const routeOptions: RouteOption[] = [
  { mode: "metro", label: "Metro + walk", minutes: 42, fixedCost: 45, comfort: 4, gramsPerKm: 30, note: "Runs every 6 min at peak" },
  { mode: "ev", label: "Own EV", minutes: 38, comfort: 5, gramsPerKm: 0, note: "Parking ₹40 at office" },
  { mode: "bus", label: "Bus", minutes: 65, fixedCost: 20, comfort: 2, gramsPerKm: 60, note: "Route 21G, 2 changes at peak" },
  { mode: "cab", label: "Cab", minutes: 32, fixedCost: 310, comfort: 4, gramsPerKm: 150, note: "Surge pricing 8:30 to 10:00" },
];

/** Modes used on each weekday this week (drives the expense tracker). */
export const weekCommute: Array<{ day: string; mode: TransportMode }> = [
  { day: "Mon", mode: "ev" },
  { day: "Tue", mode: "cab" },
  { day: "Wed", mode: "ev" },
  { day: "Thu", mode: "cab" },
  { day: "Fri", mode: "metro" },
];

export interface ChargingStation {
  id: string;
  name: string;
  km: number;
  ports: number;
  free: number;
  kw: number;
  tariff: number;
  waitMin: number;
}

export const stations: ChargingStation[] = [
  { id: "cs1", name: "Adyar Mall Fast Charge", km: 1.2, ports: 6, free: 2, kw: 60, tariff: 16, waitMin: 0 },
  { id: "cs2", name: "Guindy Tech Park", km: 13.4, ports: 8, free: 1, kw: 30, tariff: 14, waitMin: 10 },
  { id: "cs3", name: "Besant Nagar Public Bay", km: 2.8, ports: 2, free: 0, kw: 22, tariff: 12, waitMin: 25 },
  { id: "cs4", name: "OMR Highway Plaza", km: 9.1, ports: 10, free: 6, kw: 120, tariff: 18, waitMin: 0 },
];

export const tripContacts = [
  { id: "c1", name: "Raj", relation: "Spouse" },
  { id: "c2", name: "Amma", relation: "Family" },
  { id: "c3", name: "Meera", relation: "Friend" },
];

export const ridePools = [
  { id: "rp1", route: "Adyar to Guindy", time: "08:40", seats: 2, cost: 60, verified: "Employer ID verified", co: "Colleague network" },
  { id: "rp2", route: "Adyar to Tidel Park", time: "08:55", seats: 1, cost: 75, verified: "Phone and ID verified", co: "Neighbourhood group" },
];

// ── Circular Living ───────────────────────────────────────────────────────

export type WardrobeCategory = "Ethnic" | "Formal" | "Casual" | "Accessory";

export interface WardrobeItem {
  id: string;
  name: string;
  category: WardrobeCategory;
  swatch: string;
  occasions: string[];
  worn: number;
  price: number;
}

export const wardrobe: WardrobeItem[] = [
  { id: "w1", name: "Kanchipuram silk saree, maroon", category: "Ethnic", swatch: "bg-[#8B2E3B]", occasions: ["wedding", "festival"], worn: 3, price: 12000 },
  { id: "w2", name: "Cotton kurta set, sage", category: "Ethnic", swatch: "bg-[#8FAE8B]", occasions: ["festival", "casual"], worn: 14, price: 2400 },
  { id: "w3", name: "Navy blazer", category: "Formal", swatch: "bg-[#22345A]", occasions: ["office", "formal"], worn: 22, price: 6500 },
  { id: "w4", name: "Linen shirt, white", category: "Formal", swatch: "bg-[#EDEAE0]", occasions: ["office", "casual"], worn: 18, price: 2100 },
  { id: "w5", name: "Anarkali, teal", category: "Ethnic", swatch: "bg-[#2A8C86]", occasions: ["festival", "wedding"], worn: 2, price: 5400 },
  { id: "w6", name: "Denim jacket", category: "Casual", swatch: "bg-[#5A7FA6]", occasions: ["casual", "travel"], worn: 30, price: 3200 },
  { id: "w7", name: "Gold jhumkas", category: "Accessory", swatch: "bg-[#C79A55]", occasions: ["wedding", "festival"], worn: 5, price: 4800 },
  { id: "w8", name: "Silk stole, coral", category: "Accessory", swatch: "bg-[#DC6A52]", occasions: ["formal", "wedding"], worn: 4, price: 1800 },
];

export type ListingType = "rent" | "lend" | "exchange";

export interface Listing {
  id: string;
  title: string;
  type: ListingType;
  perDay: number;
  km: number;
  owner: string;
  verified: boolean;
  category: "Clothing" | "Accessory" | "Household";
  tags: string[];
}

export const listings: Listing[] = [
  { id: "l1", title: "Bridal silk saree, gold border", type: "rent", perDay: 600, km: 1.4, owner: "Lakshmi R.", verified: true, category: "Clothing", tags: ["wedding", "ethnic"] },
  { id: "l2", title: "Temple jewellery set", type: "rent", perDay: 350, km: 2.1, owner: "Divya S.", verified: true, category: "Accessory", tags: ["wedding", "ethnic"] },
  { id: "l3", title: "Sherwani, ivory", type: "rent", perDay: 700, km: 3.6, owner: "Karthik M.", verified: true, category: "Clothing", tags: ["wedding"] },
  { id: "l4", title: "Projector, 1080p", type: "lend", perDay: 0, km: 0.9, owner: "Arun P.", verified: true, category: "Household", tags: ["home"] },
  { id: "l5", title: "Large biryani pot (20 L)", type: "lend", perDay: 0, km: 1.1, owner: "Fathima N.", verified: false, category: "Household", tags: ["home", "festival"] },
  { id: "l6", title: "Party blazer, size M", type: "exchange", perDay: 0, km: 4.2, owner: "Sana K.", verified: true, category: "Clothing", tags: ["formal"] },
];

export const occasion = {
  name: "Cousin's wedding",
  daysFromNow: 12,
  days: 3,
  tag: "wedding",
  need: "Traditional outfit and jewellery",
};

/** Verified reuse activity behind the sustainability numbers. */
export const reuseActivity = [
  { id: "r1", what: "Borrowed a lehenga for Diwali", type: "garment" as const },
  { id: "r2", what: "Lent a pressure cooker to a neighbour", type: "household" as const },
  { id: "r3", what: "Rented a blazer for a conference", type: "garment" as const },
  { id: "r4", what: "Exchanged two kurtas", type: "garment" as const },
];

// ── Personal events (relative to today) ───────────────────────────────────

export const personalEvents = [
  { id: "pe1", title: "Quarterly review", detail: "Guindy office · 10:00", daysFromNow: 1, time: "10:00", weight: 4, module: "personal" as const, kind: "meeting" as const, href: "/mobility" },
  { id: "pe2", title: "Business trip to Bengaluru", detail: "Flight 06:40 · back Oct 8", daysFromNow: 7, time: "06:40", weight: 5, module: "personal" as const, kind: "trip" as const, href: "/timeline" },
  { id: "pe3", title: "Cousin's wedding", detail: "Madurai · 3 days", daysFromNow: 12, weight: 5, module: "circular" as const, kind: "event" as const, href: "/circular" },
  { id: "pe4", title: "Charge EV to 80%", detail: "Needed for tomorrow's commute", daysFromNow: 0, time: "21:00", weight: 3, module: "mobility" as const, kind: "charge" as const, href: "/mobility" },
];

// ── Notifications ─────────────────────────────────────────────────────────

export interface Notice {
  id: string;
  group: string;
  module: "kitchen" | "admin" | "mobility" | "circular" | "personal";
  title: string;
  detail: string;
  minutesAgo: number;
  href: string;
}

export const notices: Notice[] = [
  { id: "n1", group: "Before your Bengaluru trip", module: "admin", title: "Electricity bill due Oct 5", detail: "₹2,140, a day before you fly", minutesAgo: 25, href: "/obligations" },
  { id: "n2", group: "Before your Bengaluru trip", module: "kitchen", title: "Grocery delivery lands while you're away", detail: "Zepto slot Oct 6 · nobody home", minutesAgo: 25, href: "/cart" },
  { id: "n3", group: "Before your Bengaluru trip", module: "kitchen", title: "Cook-ahead dinners for Oct 5", detail: "Dal Tadka and Egg Curry keep 2 days", minutesAgo: 26, href: "/meals" },
  { id: "n4", group: "Running low", module: "kitchen", title: "Milk expires tomorrow", detail: "0.4 L left", minutesAgo: 90, href: "/pantry" },
  { id: "n5", group: "Running low", module: "kitchen", title: "Chicken short for biryani", detail: "800 g needed", minutesAgo: 95, href: "/cart" },
  { id: "n6", group: "Oct 14 pile-up", module: "admin", title: "Car insurance and licence expire the same day", detail: "Two renewals, one deadline", minutesAgo: 240, href: "/obligations" },
  { id: "n7", group: "Tomorrow's commute", module: "mobility", title: "Leave by 09:07 for the 10:00 review", detail: "EV at 58%, charge tonight", minutesAgo: 300, href: "/mobility" },
  { id: "n8", group: "Wedding on Oct 11", module: "circular", title: "Two outfits already in your wardrobe", detail: "Check before renting", minutesAgo: 1440, href: "/circular" },
];

// ── Plans ─────────────────────────────────────────────────────────────────

export const plans = {
  free: [
    "Task and reminder management",
    "Grocery inventory up to 40 items",
    "Personal timeline",
    "Basic reminders",
  ],
  premium: [
    "Advanced AI planning and collision detection",
    "Predictive shortage and expense insights",
    "Unlimited receipt and pantry scanning",
    "Detailed budget analytics",
    "Household sharing with per-module privacy",
    "Personalised recommendations",
  ],
  monthly: 199,
  yearly: 1799,
};
