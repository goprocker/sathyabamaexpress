// The demo household: one fully filled-in family so every screen has something
// real-looking to show. Dates are relative to today so reminders always land
// sensibly (a licence expiring soon, a bill due this week, fuel running low).
//
// Everything here is fictional. Phone numbers are unallocated 6000 0000xx
// numbers, identity numbers are made up (only the last four are stored), and
// nothing in the demo can call, order or message anyone.
import {
  SUBSCRIPTION_CATALOG,
  maskDocumentNumber,
  type DocumentRecord,
  type FuelFillRecord,
  type HouseholdProfile,
  type Member,
  type Obligation,
  type ServiceRecord,
  type SubscriptionProvider,
  type SubscriptionRecord,
  type TripRecord,
  type VehicleRecord,
  type Vendor,
} from "@household/contracts";
import type { CanonicalStateData } from "./index.js";

const HOUSEHOLD_ID = "hh_demo_001";
const DAY_MS = 86_400_000;

export function buildDemoHousehold(base: CanonicalStateData, now = new Date()): CanonicalStateData {
  const iso = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString().slice(0, 10);
  const at = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();
  const nowIso = now.toISOString();

  // ── People ───────────────────────────────────────────────────────────────
  const members: Member[] = [
    { id: "usr_owner", householdId: HOUSEHOLD_ID, name: "Priya Sharma", role: "OWNER", age: 38, relation: "self", phoneE164: "+916000000001", dietaryPreferences: ["vegetarian on Tuesdays"] },
    { id: "mem_arjun", householdId: HOUSEHOLD_ID, name: "Arjun Sharma", role: "ADULT", age: 41, relation: "spouse", phoneE164: "+916000000002" },
    { id: "mem_ananya", householdId: HOUSEHOLD_ID, name: "Ananya Sharma", role: "MEMBER", age: 9, relation: "child", dietaryPreferences: ["no spicy food"] },
    { id: "mem_lakshmi", householdId: HOUSEHOLD_ID, name: "Lakshmi Sharma", role: "MEMBER", age: 68, relation: "parent", dietaryPreferences: ["vegetarian", "low salt"] },
  ];

  // ── Vendors ──────────────────────────────────────────────────────────────
  const vendor = (id: string, name: string, kind: string, phone: string, location: string, notes: string, isPreferred = true): Vendor => ({
    id,
    householdId: HOUSEHOLD_ID,
    name,
    kind,
    category: kind,
    categories: [kind],
    phoneE164: phone,
    location,
    notes,
    isPreferred,
  });
  const vendors: Vendor[] = [
    vendor("vnd_milk", "Aavin Milk, Ravi", "milk", "+916000000101", "Gandhi Nagar, 2nd street", "Delivers before 6 am. Sundays double."),
    vendor("vnd_grocery", "Sri Balaji Provision Store", "grocery", "+916000000102", "Adyar main road", "Free delivery above ₹500. WhatsApp the list."),
    vendor("vnd_poultry", "Murugan Chicken Centre", "poultry", "+916000000103", "Adyar market, shop 14", "Fresh cut. Closed on Tuesdays."),
    vendor("vnd_veg", "Fresh Basket, Kumar", "vegetables", "+916000000104", "Besant Nagar", "Vegetables and fruit, delivers by 8 am."),
    vendor("vnd_gas", "Bharat Gas Agency", "gas", "+916000000105", "Indira Nagar", "Cylinder booking. Usually 2 days."),
    vendor("vnd_water", "Aqua Fresh Water Cans", "water", "+916000000106", "Kotturpuram", "20 L cans, twice a week."),
  ];

  // ── Documents (details only: files can't be uploaded to the demo) ─────────
  const doc = (id: string, type: DocumentRecord["type"], over: Partial<DocumentRecord> & { number?: string }): DocumentRecord => {
    const { number, ...rest } = over;
    return {
      id,
      type,
      createdAt: at(-20),
      updatedAt: at(-20),
      ...(number ? { numberDisplay: maskDocumentNumber(type, number) } : {}),
      ...rest,
    };
  };
  const documents: DocumentRecord[] = [
    doc("doc_aadhaar_priya", "aadhaar", { holderId: "usr_owner", number: "1234 5678 4821" }),
    doc("doc_aadhaar_arjun", "aadhaar", { holderId: "mem_arjun", number: "2345 6789 7712" }),
    doc("doc_pan_priya", "pan", { holderId: "usr_owner", number: "ABCPS1234K" }),
    doc("doc_pan_arjun", "pan", { holderId: "mem_arjun", number: "BCDAS5678L" }),
    doc("doc_dl_priya", "driving_licence", { holderId: "usr_owner", number: "TN07 20150012345", issuedOn: iso(-3650 + 12), expiresOn: iso(12), notes: "Renew at the RTO" }),
    doc("doc_dl_arjun", "driving_licence", { holderId: "mem_arjun", number: "TN07 20120054321", issuedOn: iso(-1800), expiresOn: iso(900) }),
    doc("doc_passport", "passport", { holderId: "usr_owner", number: "N1234567", issuedOn: iso(-2200), expiresOn: iso(1400) }),
    doc("doc_rc_city", "vehicle_rc", { vehicleId: "veh_city", numberDisplay: "TN 07 CX 4419", expiresOn: iso(2400) }),
    doc("doc_ins_city", "insurance", { vehicleId: "veh_city", numberDisplay: "ICICI-2026-778812", expiresOn: iso(25), notes: "Zero-depreciation cover" }),
    doc("doc_puc_city", "puc", { vehicleId: "veh_city", numberDisplay: "PUC-449021", expiresOn: iso(41) }),
    doc("doc_rc_activa", "vehicle_rc", { vehicleId: "veh_activa", numberDisplay: "TN 07 BQ 9021", expiresOn: iso(3100) }),
    doc("doc_ration", "other", { label: "Ration card", holderId: "usr_owner" }),
  ];

  // ── Vehicles ─────────────────────────────────────────────────────────────
  const city: VehicleRecord = {
    id: "veh_city",
    name: "Honda City",
    kind: "car",
    fuel: "petrol",
    registrationNo: "TN 07 CX 4419",
    year: 2021,
    odometerKm: 47_290,
    mileage: 17,
    tankCapacity: 40,
    fuelLevelPercent: 11,
    fuelQuantity: 4.4,
    fuelAsOf: nowIso,
    dailyKm: 45,
    serviceIntervalKm: 10_000,
    serviceIntervalMonths: 6,
    lastServiceOn: iso(-172),
    lastServiceOdometerKm: 38_000,
    tyreCondition: "worn",
    tyreReplacedOn: "2023-11-04",
    tyreReplacedOdometerKm: 22_000,
    createdAt: at(-60),
    updatedAt: nowIso,
  };
  const activa: VehicleRecord = {
    id: "veh_activa",
    name: "Honda Activa",
    kind: "scooter",
    fuel: "petrol",
    registrationNo: "TN 07 BQ 9021",
    year: 2022,
    odometerKm: 12_400,
    mileage: 45,
    tankCapacity: 5.3,
    fuelLevelPercent: 60,
    fuelQuantity: 3.2,
    fuelAsOf: nowIso,
    dailyKm: 12,
    lastServiceOn: iso(-70),
    lastServiceOdometerKm: 11_000,
    tyreCondition: "good",
    tyreReplacedOn: iso(-200),
    tyreReplacedOdometerKm: 8_500,
    createdAt: at(-60),
    updatedAt: nowIso,
  };
  const vehicles = [city, activa];

  // Brim-full fills about 550 km apart, each taking 40 L: roughly 13.8 km/l against 17 rated, a real drop to flag.
  const fill = (id: string, vehicleId: string, daysAgo: number, odometerKm: number, quantity: number, price: number): FuelFillRecord => ({
    id,
    vehicleId,
    date: iso(-daysAgo),
    quantity,
    amountInr: Math.round(quantity * price),
    odometerKm,
    fullTank: true,
    createdAt: at(-daysAgo),
  });
  const fuelFills: FuelFillRecord[] = [
    fill("fill_c1", "veh_city", 50, 44_600, 30, 103.4),
    fill("fill_c2", "veh_city", 39, 45_140, 40, 103.9),
    fill("fill_c3", "veh_city", 28, 45_690, 40, 104.2),
    fill("fill_c4", "veh_city", 19, 46_240, 40, 104.4),
    fill("fill_c5", "veh_city", 11, 46_800, 40, 104.6),
    fill("fill_a1", "veh_activa", 35, 11_650, 4.9, 103.8),
    fill("fill_a2", "veh_activa", 12, 12_100, 5.1, 104.4),
  ];
  // The 46,800 to 47,290 stretch above (490 km) is why the City is almost dry.
  const trips: TripRecord[] = [
    { id: "trip_1", date: iso(-1), mode: "own_vehicle", vehicleId: "veh_city", distanceKm: 48, note: "Office and back", createdAt: at(-1) },
    { id: "trip_2", date: iso(-2), mode: "own_vehicle", vehicleId: "veh_city", distanceKm: 62, note: "School run and market", createdAt: at(-2) },
    { id: "trip_3", date: iso(-3), mode: "metro", distanceKm: 26, note: "Office by metro", createdAt: at(-3) },
    { id: "trip_4", date: iso(-2), mode: "own_vehicle", vehicleId: "veh_activa", distanceKm: 9, note: "Milk and groceries", createdAt: at(-2) },
  ];
  const serviceRecords: ServiceRecord[] = [
    { id: "svc_1", vehicleId: "veh_city", date: iso(-172), kind: "routine", odometerKm: 38_000, costInr: 4650, note: "Oil, filters, brake check", createdAt: at(-172) },
    { id: "svc_2", vehicleId: "veh_city", date: iso(-300), kind: "battery", odometerKm: 33_900, costInr: 5200, note: "New battery", createdAt: at(-300) },
    { id: "svc_3", vehicleId: "veh_activa", date: iso(-70), kind: "routine", odometerKm: 11_000, costInr: 1200, createdAt: at(-70) },
  ];

  // ── Bills and subscriptions ──────────────────────────────────────────────
  const electricityBills: HouseholdProfile["electricityBills"] = [
    { id: "bill_now", amountInr: 2140, dueDate: iso(5), units: 310, billingPeriod: "Aug to Sep", consumerNo: "09-224-1187", paid: false, createdAt: at(-2) },
    { id: "bill_prev", amountInr: 1980, dueDate: iso(-55), units: 284, billingPeriod: "Jun to Jul", consumerNo: "09-224-1187", paid: true, createdAt: at(-60) },
    { id: "bill_prev2", amountInr: 2260, dueDate: iso(-115), units: 322, billingPeriod: "Apr to May", consumerNo: "09-224-1187", paid: true, createdAt: at(-120) },
  ];

  const sub = (id: string, provider: SubscriptionProvider, plan: string, amountInr: number, cycle: SubscriptionRecord["cycle"], dueIn: number): SubscriptionRecord => ({
    id,
    provider,
    name: SUBSCRIPTION_CATALOG[provider].label,
    plan,
    amountInr,
    cycle,
    nextDueOn: iso(dueIn),
    payUrl: SUBSCRIPTION_CATALOG[provider].payUrl,
    createdAt: at(-90),
  });
  const subscriptions: SubscriptionRecord[] = [
    sub("sub_hotstar", "hotstar", "Super, mobile", 299, "monthly", 1),
    sub("sub_netflix", "netflix", "Standard, 2 screens", 649, "monthly", 4),
    sub("sub_youtube", "youtube_premium", "Family plan", 299, "monthly", 11),
    sub("sub_spotify", "spotify", "Individual", 119, "monthly", 15),
    sub("sub_sonyliv", "sonyliv", "Premium", 399, "quarterly", 21),
    sub("sub_prime", "prime_video", "Annual", 1499, "yearly", 58),
    sub("sub_zee5", "zee5", "Premium HD", 99, "monthly", -2),
  ];

  const profile: HouseholdProfile = {
    startedAt: at(-3),
    skippedSteps: [],
    documents,
    vehicles,
    fuelFills,
    trips,
    serviceRecords,
    electricityBills,
    subscriptions,
  };

  // Things with dates that are not a document, bill or service.
  const obligation = (id: string, category: Obligation["category"], title: string, subtitle: string, dueIn: number, amountInr?: number): Obligation => ({
    id,
    householdId: HOUSEHOLD_ID,
    category,
    title,
    subtitle,
    dueDate: iso(dueIn),
    daysUntilDue: dueIn,
    ...(amountInr !== undefined ? { amountInr } : {}),
    status: dueIn < 0 ? "OVERDUE" : dueIn <= 14 ? "DUE_SOON" : "UPCOMING",
    dependentEntity: title,
  });
  const obligations: Obligation[] = [
    obligation("obl_broadband", "utility", "Broadband bill (ACT Fibernet)", "Monthly plan, autopay off", 8, 799),
    obligation("obl_school", "BILL", "School fees, Ananya (term 2)", "Class 4 · Vidya Mandir", 20, 18_500),
    obligation("obl_checkup", "APPOINTMENT", "Health check-up, Lakshmi", "Cardiology follow-up · Dr. Rao", 9),
  ];

  return {
    ...base,
    isDemo: true,
    households: [{ id: HOUSEHOLD_ID, name: "Sharma household (demo)", timezone: "Asia/Kolkata", createdAt: nowIso }],
    members,
    vendors,
    obligations,
    profile,
  };
}
