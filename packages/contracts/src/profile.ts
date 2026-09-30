// Household profile: everything the Setup section collects about a household.
// Family, identity and vehicle documents, vehicles with fuel and service
// history, utility bills and the local vendors a household orders from.
// Inputs are validated here once and reused by the web forms and the API.
import { z } from "zod";

// ── Small building blocks ──────────────────────────────────────────────────

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-05");

const shortText = (max: number) => z.string().trim().min(1).max(max);
/** An optional string where an empty box means "not given". The key stays optional in the inferred type. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

/** An optional date where an empty box means "not given". */
const optionalDate = IsoDateSchema.or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** Turns "98404 12345", "+91 9840412345" or "09840412345" into +919840412345, or null if it is not an Indian mobile number. */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

export const PhoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const phone = normalizeIndianPhone(v);
    if (!phone) ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number" });
    return phone ?? "";
  });

// ── Family ─────────────────────────────────────────────────────────────────

export const FAMILY_RELATIONS = ["self", "spouse", "child", "parent", "sibling", "grandparent", "other"] as const;
export const FamilyRelationSchema = z.enum(FAMILY_RELATIONS);
export type FamilyRelation = z.infer<typeof FamilyRelationSchema>;

export const FamilyMemberInputSchema = z.object({
  name: shortText(80),
  age: z.number().int().min(0).max(120),
  relation: FamilyRelationSchema,
  dietaryPreferences: z.array(shortText(40)).max(10).optional(),
  phone: z.string().trim().transform((v, ctx) => {
    if (v === "") return undefined;
    const phone = normalizeIndianPhone(v);
    if (!phone) ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number" });
    return phone ?? undefined;
  }).optional(),
});
export type FamilyMemberInput = z.infer<typeof FamilyMemberInputSchema>;

// ── Documents ──────────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = [
  "aadhaar",
  "pan",
  "driving_licence",
  "passport",
  "voter_id",
  "vehicle_rc",
  "insurance",
  "puc",
  "other",
] as const;
export const DocumentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  aadhaar: "Aadhaar card",
  pan: "PAN card",
  driving_licence: "Driving licence",
  passport: "Passport",
  voter_id: "Voter ID",
  vehicle_rc: "Vehicle RC",
  insurance: "Insurance policy",
  puc: "Pollution certificate (PUC)",
  other: "Other document",
};

/** Identity numbers are never stored in full; only a masked form is kept. The uploaded file is the source of truth. */
export const MASKED_DOCUMENT_TYPES: ReadonlySet<DocumentType> = new Set([
  "aadhaar",
  "pan",
  "driving_licence",
  "passport",
  "voter_id",
]);

export function maskDocumentNumber(type: DocumentType, raw: string): string {
  const clean = raw.replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";
  if (!MASKED_DOCUMENT_TYPES.has(type)) return raw.trim();
  const last4 = clean.slice(-4);
  return type === "aadhaar" ? `•••• •••• ${last4}` : `${"•".repeat(Math.max(4, clean.length - 4))}${last4}`;
}

export const DOCUMENT_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

export const DocumentInputSchema = z.object({
  type: DocumentTypeSchema,
  label: optionalText(80),
  holderId: optionalText(60),
  vehicleId: optionalText(60),
  number: optionalText(40),
  issuedOn: optionalDate,
  expiresOn: optionalDate,
  notes: optionalText(300),
});
export type DocumentInput = z.infer<typeof DocumentInputSchema>;

export interface StoredFileRef {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface DocumentRecord extends Omit<DocumentInput, "number"> {
  id: string;
  /** Masked for identity documents (see maskDocumentNumber). */
  numberDisplay?: string | undefined;
  file?: StoredFileRef | undefined;
  createdAt: string;
  updatedAt: string;
}

// ── Vehicles ───────────────────────────────────────────────────────────────

export const VEHICLE_KINDS = ["car", "bike", "scooter", "auto", "other"] as const;
export const VehicleKindSchema = z.enum(VEHICLE_KINDS);
export type VehicleKind = z.infer<typeof VehicleKindSchema>;

export const VEHICLE_FUELS = ["petrol", "diesel", "cng", "electric", "hybrid"] as const;
export const VehicleFuelSchema = z.enum(VEHICLE_FUELS);
export type VehicleFuel = z.infer<typeof VehicleFuelSchema>;

/** km per litre for petrol/diesel/hybrid, km per kg for CNG, km per kWh for electric. */
export const FUEL_UNITS: Record<VehicleFuel, { mileage: string; quantity: string; quantityLong: string }> = {
  petrol: { mileage: "km/l", quantity: "L", quantityLong: "litres" },
  diesel: { mileage: "km/l", quantity: "L", quantityLong: "litres" },
  hybrid: { mileage: "km/l", quantity: "L", quantityLong: "litres" },
  cng: { mileage: "km/kg", quantity: "kg", quantityLong: "kg" },
  electric: { mileage: "km/kWh", quantity: "kWh", quantityLong: "kWh" },
};

export const TYRE_CONDITIONS = ["unknown", "good", "worn", "replace_soon"] as const;
export const TyreConditionSchema = z.enum(TYRE_CONDITIONS);
export type TyreCondition = z.infer<typeof TyreConditionSchema>;

export const VehicleInputSchema = z.object({
  name: shortText(80),
  kind: VehicleKindSchema,
  fuel: VehicleFuelSchema,
  registrationNo: optionalText(20),
  year: z.number().int().min(1980).max(2100).optional(),
  odometerKm: z.number().min(0).max(2_000_000),
  /** What the vehicle should do: km per unit of fuel. */
  mileage: z.number().positive().max(500),
  tankCapacity: z.number().positive().max(500),
  /** How full the tank is right now, 0 to 100. */
  fuelLevelPercent: z.number().min(0).max(100).default(100),
  /** Typical distance per day, used to say when to refuel. */
  dailyKm: z.number().min(0).max(1000).optional(),
  serviceIntervalKm: z.number().int().min(500).max(50_000).optional(),
  serviceIntervalMonths: z.number().int().min(1).max(36).optional(),
  lastServiceOn: optionalDate,
  lastServiceOdometerKm: z.number().min(0).max(2_000_000).optional(),
  tyreCondition: TyreConditionSchema.default("unknown"),
  tyreReplacedOn: optionalDate,
  tyreReplacedOdometerKm: z.number().min(0).max(2_000_000).optional(),
});
export type VehicleInput = z.infer<typeof VehicleInputSchema>;

export interface VehicleRecord extends VehicleInput {
  id: string;
  /** Best estimate of fuel on board at `fuelAsOf`, in the vehicle's fuel unit. Trips and fills move it forward. */
  fuelQuantity: number;
  fuelAsOf: string;
  createdAt: string;
  updatedAt: string;
}

export const FuelFillInputSchema = z.object({
  date: IsoDateSchema,
  quantity: z.number().positive().max(1000),
  amountInr: z.number().min(0).max(1_000_000),
  odometerKm: z.number().min(0).max(2_000_000).optional(),
  /** Filled to the brim. Two full fills in a row give a reliable real-world mileage. */
  fullTank: z.boolean().default(true),
});
export type FuelFillInput = z.infer<typeof FuelFillInputSchema>;

export interface FuelFillRecord extends FuelFillInput {
  id: string;
  vehicleId: string;
  file?: StoredFileRef | undefined;
  createdAt: string;
}

export const TRAVEL_MODES = ["own_vehicle", "metro", "bus", "cab", "walk", "other"] as const;
export const TravelModeSchema = z.enum(TRAVEL_MODES);
export type TravelMode = z.infer<typeof TravelModeSchema>;

export const TripInputSchema = z
  .object({
    date: IsoDateSchema,
    mode: TravelModeSchema,
    vehicleId: optionalText(60),
    distanceKm: z.number().positive().max(5000),
    note: optionalText(120),
  })
  .refine((t) => t.mode !== "own_vehicle" || Boolean(t.vehicleId), {
    message: "Choose which vehicle you used",
    path: ["vehicleId"],
  });
export type TripInput = z.infer<typeof TripInputSchema>;

export interface TripRecord extends Omit<TripInput, "vehicleId"> {
  id: string;
  vehicleId?: string | undefined;
  createdAt: string;
}

export const SERVICE_KINDS = ["routine", "tyre", "battery", "brakes", "repair", "other"] as const;
export const ServiceKindSchema = z.enum(SERVICE_KINDS);
export type ServiceKind = z.infer<typeof ServiceKindSchema>;

export const ServiceRecordInputSchema = z.object({
  date: IsoDateSchema,
  kind: ServiceKindSchema,
  odometerKm: z.number().min(0).max(2_000_000).optional(),
  costInr: z.number().min(0).max(10_000_000).optional(),
  note: optionalText(200),
});
export type ServiceRecordInput = z.infer<typeof ServiceRecordInputSchema>;

export interface ServiceRecord extends ServiceRecordInput {
  id: string;
  vehicleId: string;
  createdAt: string;
}

// ── Bills ──────────────────────────────────────────────────────────────────

export const ElectricityBillInputSchema = z.object({
  billingPeriod: optionalText(40),
  units: z.number().min(0).max(100_000).optional(),
  amountInr: z.number().positive().max(10_000_000),
  dueDate: IsoDateSchema,
  consumerNo: optionalText(30),
  paid: z.boolean().default(false),
});
export type ElectricityBillInput = z.infer<typeof ElectricityBillInputSchema>;

export interface ElectricityBillRecord extends ElectricityBillInput {
  id: string;
  file?: StoredFileRef | undefined;
  createdAt: string;
}

// ── Vendors ────────────────────────────────────────────────────────────────

export const VENDOR_KINDS = [
  "milk",
  "grocery",
  "poultry",
  "meat",
  "fish",
  "vegetables",
  "gas",
  "water",
  "pharmacy",
  "laundry",
  "plumber",
  "electrician",
  "other",
] as const;
export const VendorKindSchema = z.enum(VENDOR_KINDS);
export type VendorKind = z.infer<typeof VendorKindSchema>;

export const VENDOR_LABELS: Record<VendorKind, string> = {
  milk: "Milk",
  grocery: "Grocery",
  poultry: "Poultry (chicken and eggs)",
  meat: "Mutton and meat",
  fish: "Fish",
  vegetables: "Vegetables and fruit",
  gas: "Gas cylinder",
  water: "Water can",
  pharmacy: "Pharmacy",
  laundry: "Laundry",
  plumber: "Plumber",
  electrician: "Electrician",
  other: "Other",
};

export const VendorInputSchema = z.object({
  name: shortText(80),
  kind: VendorKindSchema,
  phone: PhoneSchema,
  location: optionalText(160),
  notes: optionalText(300),
  isPreferred: z.boolean().default(false),
});
export type VendorInput = z.infer<typeof VendorInputSchema>;

// ── Subscriptions (OTT, music and other recurring services) ────────────────

export const SUBSCRIPTION_PROVIDERS = ["netflix", "prime_video", "hotstar", "spotify", "youtube_premium", "sonyliv", "zee5", "apple_tv", "other"] as const;
export const SubscriptionProviderSchema = z.enum(SUBSCRIPTION_PROVIDERS);
export type SubscriptionProvider = z.infer<typeof SubscriptionProviderSchema>;

/** Each service's plans and sign-up page. "Pay" opens this page in the browser; the payment itself happens on the provider's site. */
export const SUBSCRIPTION_CATALOG: Record<SubscriptionProvider, { label: string; payUrl: string }> = {
  netflix: { label: "Netflix", payUrl: "https://www.netflix.com/signup/planform" },
  prime_video: { label: "Amazon Prime", payUrl: "https://www.primevideo.com/signup?ref_=atv_nb_join_prime" },
  hotstar: { label: "JioHotstar", payUrl: "https://www.hotstar.com/in/subscribe" },
  spotify: { label: "Spotify", payUrl: "https://www.spotify.com/in-en/premium/" },
  youtube_premium: { label: "YouTube Premium", payUrl: "https://www.youtube.com/premium" },
  sonyliv: { label: "SonyLIV", payUrl: "https://www.sonyliv.com/subscribe" },
  zee5: { label: "ZEE5", payUrl: "https://www.zee5.com/premium" },
  apple_tv: { label: "Apple TV+", payUrl: "https://www.apple.com/in/apple-tv-plus/" },
  other: { label: "Other service", payUrl: "" },
};

export const BILLING_CYCLES = ["monthly", "quarterly", "yearly"] as const;
export const BillingCycleSchema = z.enum(BILLING_CYCLES);
export type BillingCycle = z.infer<typeof BillingCycleSchema>;
export const CYCLE_MONTHS: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Only https links are accepted, so a saved link can never be a script or an unencrypted page. */
export const SecureUrlSchema = z
  .string()
  .trim()
  .url("Enter a full link starting with https://")
  .refine((u) => u.startsWith("https://"), "The link must start with https://");

export const SubscriptionInputSchema = z
  .object({
    provider: SubscriptionProviderSchema,
    /** Required for "other"; catalogue services already have a name. */
    name: optionalText(60),
    plan: optionalText(60),
    amountInr: z.number().positive().max(1_000_000),
    cycle: BillingCycleSchema,
    nextDueOn: IsoDateSchema,
    /** Leave empty to use the service's own page. Required for "other". */
    payUrl: z
      .string()
      .trim()
      .transform((v) => (v === "" ? undefined : v))
      .pipe(SecureUrlSchema.optional())
      .optional(),
  })
  .refine((s) => s.provider !== "other" || Boolean(s.name), { message: "Give the service a name", path: ["name"] })
  .refine((s) => s.provider !== "other" || Boolean(s.payUrl), { message: "Add the link where you pay", path: ["payUrl"] });
export type SubscriptionInput = z.infer<typeof SubscriptionInputSchema>;

export interface SubscriptionRecord {
  id: string;
  provider: SubscriptionProvider;
  /** What to show: the catalogue name, or the custom name for "other". */
  name: string;
  plan?: string | undefined;
  amountInr: number;
  cycle: BillingCycle;
  nextDueOn: string;
  /** Where "Pay" goes. Always https. */
  payUrl: string;
  lastPaidOn?: string | undefined;
  createdAt: string;
}

/** The date after `iso` once one billing cycle has passed. Month ends are kept: 31 Jan + 1 month is 28 Feb. */
export function nextBillingDate(iso: string, cycle: BillingCycle): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + CYCLE_MONTHS[cycle]);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

// ── The profile as stored with the household ───────────────────────────────

export const SETUP_STEP_IDS = ["family", "documents", "vehicles", "bills", "vendors"] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

export interface HouseholdProfile {
  /** Set the first time the Setup section is opened. */
  startedAt?: string | undefined;
  /** Steps the household marked "not for us" (for example, no vehicles), so they count as done. */
  skippedSteps?: SetupStepId[] | undefined;
  documents: DocumentRecord[];
  vehicles: VehicleRecord[];
  fuelFills: FuelFillRecord[];
  trips: TripRecord[];
  serviceRecords: ServiceRecord[];
  electricityBills: ElectricityBillRecord[];
  /** Absent on households saved before subscriptions existed; treat as empty. */
  subscriptions?: SubscriptionRecord[] | undefined;
}

export function emptyHouseholdProfile(): HouseholdProfile {
  return { skippedSteps: [], documents: [], vehicles: [], fuelFills: [], trips: [], serviceRecords: [], electricityBills: [], subscriptions: [] };
}

// ── Due dates ──────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Days from `today` to `dueDate` (negative when past) and the status that follows. */
export function obligationTiming(dueDate: string, today: string): { daysUntilDue: number; status: "OVERDUE" | "DUE_SOON" | "UPCOMING" } {
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  return { daysUntilDue: days, status: days < 0 ? "OVERDUE" : days <= 14 ? "DUE_SOON" : "UPCOMING" };
}
