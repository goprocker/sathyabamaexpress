// What the Setup section adds up to: how complete the household's profile is,
// what needs attention, and the dated obligations that follow from the
// documents, bills and vehicles a household has told us about. Deterministic.
import {
  DOCUMENT_LABELS,
  obligationTiming,
  type DocumentRecord,
  type DocumentType,
  type ElectricityBillRecord,
  type FuelFillRecord,
  type HouseholdProfile,
  type Member,
  type Obligation,
  type ServiceRecord,
  type SetupStepId,
  type SubscriptionRecord,
  type TripRecord,
  type VehicleRecord,
  type Vendor,
} from "@household/contracts";
import { daysBetween } from "./engine.js";
import { vehicleStatus, type Reminder, type ReminderSeverity, type VehicleStatus } from "./vehicles.js";

// ── Progress ───────────────────────────────────────────────────────────────

const IDENTITY_DOCUMENTS: ReadonlySet<DocumentType> = new Set(["aadhaar", "pan", "driving_licence", "passport", "voter_id"]);

export interface SetupStep {
  id: SetupStepId;
  label: string;
  hint: string;
  done: boolean;
  skipped: boolean;
  detail: string;
}

export interface SetupProgress {
  percent: number;
  steps: SetupStep[];
  /** The first step still to do, or null when everything is done or skipped. */
  nextStep: SetupStepId | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function setupProgress(input: { profile: HouseholdProfile; members: Member[]; vendors: Vendor[] }): SetupProgress {
  const { profile, members, vendors } = input;
  const skipped = new Set(profile.skippedSteps ?? []);
  const owner = members.find((m) => m.relation === "self") ?? members[0];
  const identityDocs = profile.documents.filter((d) => IDENTITY_DOCUMENTS.has(d.type));

  const steps: SetupStep[] = [
    {
      id: "family",
      label: "Family",
      hint: "You and the people you live with",
      done: owner?.age !== undefined,
      skipped: false,
      detail: owner?.age === undefined ? "Add your own details first" : plural(members.length, "person", "people"),
    },
    {
      id: "documents",
      label: "Documents",
      hint: "Aadhaar, PAN, licence and more",
      done: identityDocs.length > 0,
      skipped: skipped.has("documents"),
      detail: profile.documents.length ? plural(profile.documents.length, "document") : "None yet",
    },
    {
      id: "vehicles",
      label: "Vehicles",
      hint: "Mileage, service and fuel reminders",
      done: profile.vehicles.length > 0,
      skipped: skipped.has("vehicles"),
      detail: profile.vehicles.length ? plural(profile.vehicles.length, "vehicle") : "None yet",
    },
    {
      id: "bills",
      label: "Bills",
      hint: "Electricity and fuel bills",
      done: profile.electricityBills.length > 0,
      skipped: skipped.has("bills"),
      detail: profile.electricityBills.length ? plural(profile.electricityBills.length, "bill") : "None yet",
    },
    {
      id: "vendors",
      label: "Vendors",
      hint: "Milk, grocery, poultry and more",
      done: vendors.length > 0,
      skipped: skipped.has("vendors"),
      detail: vendors.length ? plural(vendors.length, "vendor") : "None yet",
    },
  ];
  const finished = steps.filter((s) => s.done || s.skipped).length;
  return {
    percent: Math.round((finished / steps.length) * 100),
    steps,
    nextStep: steps.find((s) => !s.done && !s.skipped)?.id ?? null,
  };
}

// ── Reminders ──────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<ReminderSeverity, number> = { urgent: 0, warning: 1, info: 2 };

function dueSeverity(days: number): ReminderSeverity {
  return days < 0 || days <= 3 ? "urgent" : days <= 14 ? "warning" : "info";
}

const inDays = (days: number) => (days < 0 ? `${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

/** Everything worth a nudge right now: vehicles, expiring documents and unpaid bills, most urgent first. */
export function profileReminders(input: { profile: HouseholdProfile; today: string; vehicleStatuses?: VehicleStatus[] }): Reminder[] {
  const { profile, today } = input;
  const reminders: Reminder[] = [];
  const statuses =
    input.vehicleStatuses ??
    profile.vehicles.map((vehicle) =>
      vehicleStatus({ vehicle, fills: profile.fuelFills, trips: profile.trips, services: profile.serviceRecords, today }),
    );
  for (const status of statuses) reminders.push(...status.reminders);

  for (const doc of profile.documents) {
    if (!doc.expiresOn) continue;
    const days = daysBetween(today, doc.expiresOn);
    if (days > 30) continue;
    const label = doc.label || DOCUMENT_LABELS[doc.type];
    reminders.push({
      id: `document:${doc.id}`,
      kind: "document",
      severity: dueSeverity(days),
      title: days < 0 ? `${label} has expired` : `${label} expires ${inDays(days)}`,
      detail: `Valid until ${doc.expiresOn}. Renew it in good time.`,
      dueOn: doc.expiresOn,
      href: "/onboarding?tab=documents",
    });
  }

  for (const bill of profile.electricityBills) {
    if (bill.paid) continue;
    const days = daysBetween(today, bill.dueDate);
    if (days > 10) continue;
    reminders.push({
      id: `bill:${bill.id}`,
      kind: "bill",
      severity: dueSeverity(days),
      title: days < 0 ? "Electricity bill is overdue" : `Electricity bill due ${inDays(days)}`,
      detail: `₹${Math.round(bill.amountInr).toLocaleString("en-IN")} due ${bill.dueDate}.`,
      dueOn: bill.dueDate,
      href: "/onboarding?tab=bills",
    });
  }

  for (const sub of profile.subscriptions ?? []) {
    const days = daysBetween(today, sub.nextDueOn);
    if (days > 5) continue;
    reminders.push({
      id: `subscription:${sub.id}`,
      kind: "subscription",
      severity: dueSeverity(days),
      title: days < 0 ? `${sub.name} payment is overdue` : `${sub.name} renews ${inDays(days)}`,
      detail: `₹${Math.round(sub.amountInr).toLocaleString("en-IN")} ${sub.cycle}. Pay on ${new URL(sub.payUrl).hostname.replace(/^www\./, "")}.`,
      dueOn: sub.nextDueOn,
      href: "/obligations",
    });
  }

  return reminders.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"),
  );
}

// ── Obligations ────────────────────────────────────────────────────────────

const DOC_CATEGORY: Partial<Record<DocumentType, Obligation["category"]>> = {
  insurance: "vehicle",
  puc: "vehicle",
  vehicle_rc: "vehicle",
};

/** Marks obligations that come from the profile, so they can be replaced wholesale when it changes. */
export const PROFILE_OBLIGATION_PREFIX = "profile:";

/**
 * The dated things the profile implies: document expiries, unpaid electricity
 * bills and vehicle services. They are written into the household's
 * obligations, so Life Admin, the timeline and the forecasts all see them.
 */
export function deriveObligations(input: {
  profile: HouseholdProfile;
  householdId: string;
  today: string;
  vehicleStatuses?: VehicleStatus[];
}): Obligation[] {
  const { profile, householdId, today } = input;
  const out: Obligation[] = [];
  const make = (
    id: string,
    category: Obligation["category"],
    title: string,
    subtitle: string,
    dueDate: string,
    extra: Partial<Obligation> = {},
  ): Obligation => {
    const timing = obligationTiming(dueDate, today);
    return {
      id: `obl_p_${id}`,
      householdId,
      category,
      title,
      subtitle,
      dueDate,
      ...timing,
      recurrence: "NONE",
      sourceEventId: `${PROFILE_OBLIGATION_PREFIX}${id}`,
      ...extra,
    };
  };

  for (const doc of profile.documents) {
    if (!doc.expiresOn) continue;
    const label = doc.label || DOCUMENT_LABELS[doc.type];
    out.push(make(`doc:${doc.id}`, DOC_CATEGORY[doc.type] ?? "document", `${label} expires`, doc.notes ?? "Renew before it lapses", doc.expiresOn, { dependentEntity: label }));
  }

  for (const bill of profile.electricityBills) {
    if (bill.paid) continue;
    out.push(
      make(`bill:${bill.id}`, "utility", "Electricity bill", bill.billingPeriod ? `Period ${bill.billingPeriod}` : "Pay before the due date", bill.dueDate, {
        amountInr: bill.amountInr,
        dependentEntity: "Electricity board",
      }),
    );
  }

  for (const sub of profile.subscriptions ?? []) {
    out.push(
      make(`sub:${sub.id}`, "subscription", sub.name, [sub.plan, sub.cycle].filter(Boolean).join(" · "), sub.nextDueOn, {
        amountInr: sub.amountInr,
        dependentEntity: sub.name,
        payUrl: sub.payUrl,
        recurrence: sub.cycle === "monthly" ? "MONTHLY" : "NONE",
      }),
    );
  }

  const statuses =
    input.vehicleStatuses ??
    profile.vehicles.map((vehicle) =>
      vehicleStatus({ vehicle, fills: profile.fuelFills, trips: profile.trips, services: profile.serviceRecords, today }),
    );
  for (const s of statuses) {
    if (!s.service.nextDueOn || s.service.state === "unknown") continue;
    out.push(make(`svc:${s.vehicleId}`, "vehicle_service", `Service: ${s.name}`, s.service.detail, s.service.nextDueOn, { dependentEntity: s.name }));
  }
  return out;
}

// ── What the assistant may know ────────────────────────────────────────────

/**
 * A trimmed view of the household for the assistant: names, types, dates and
 * figures only. Document numbers, phone numbers and addresses never leave the
 * household record, so they cannot end up in a model prompt.
 */
export function assistantHousehold(input: {
  profile: HouseholdProfile;
  members: Member[];
  vendors: Vendor[];
  vehicleStatuses: VehicleStatus[];
}): Record<string, unknown> {
  const { profile, members, vendors, vehicleStatuses } = input;
  return {
    family: members.map((m) => ({ name: m.name, age: m.age, relation: m.relation })),
    documents: profile.documents.map((d) => ({ type: d.type, label: d.label, expiresOn: d.expiresOn })),
    vehicles: vehicleStatuses.map((v) => ({
      name: v.name,
      fuel: v.fuel,
      odometerKm: v.odometerKm,
      mileage: v.mileage,
      fuelLeft: v.fuelLeft,
      service: v.service,
      tyre: v.tyre,
      suggestions: v.suggestions,
    })),
    electricityBills: profile.electricityBills.map((b) => ({ amountInr: b.amountInr, dueDate: b.dueDate, paid: b.paid })),
    subscriptions: (profile.subscriptions ?? []).map((sub) => ({ name: sub.name, amountInr: sub.amountInr, cycle: sub.cycle, nextDueOn: sub.nextDueOn })),
    vendors: vendors.map((v) => ({ name: v.name, kind: v.kind })),
  };
}

// ── The shape of GET /api/profile ──────────────────────────────────────────

export interface ProfileView {
  /** When Setup was first opened; null until then. */
  startedAt: string | null;
  /** False in demo mode: stored files need a signed-in account. */
  uploadsEnabled: boolean;
  progress: SetupProgress;
  family: Member[];
  documents: Array<DocumentRecord & { label: string; typeLabel: string; daysToExpiry: number | null }>;
  vehicles: Array<{
    vehicle: VehicleRecord;
    status: VehicleStatus;
    recentFills: FuelFillRecord[];
    recentServices: ServiceRecord[];
    recentTrips: TripRecord[];
  }>;
  bills: Array<ElectricityBillRecord & { daysUntilDue: number; status: "OVERDUE" | "DUE_SOON" | "UPCOMING" }>;
  subscriptions: Array<SubscriptionRecord & { daysUntilDue: number; status: "OVERDUE" | "DUE_SOON" | "UPCOMING" }>;
  /** True for the shared demo household: sample data, no uploads, no live calls. */
  isDemo: boolean;
  vendors: Vendor[];
  reminders: Reminder[];
}
