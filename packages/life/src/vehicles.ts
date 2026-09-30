// Vehicle rules: real mileage from fuel bills, fuel left after trips, service
// and tyre status, and the suggestions and reminders that follow. Pure and
// deterministic: the same records and date always give the same answer, and
// none of it is model output.
import {
  FUEL_UNITS,
  type FuelFillRecord,
  type ServiceRecord,
  type TripRecord,
  type VehicleFuel,
  type VehicleKind,
  type VehicleRecord,
} from "@household/contracts";
import { addDays, daysBetween } from "./engine.js";

export type ReminderSeverity = "info" | "warning" | "urgent";
export type ReminderKind = "fuel" | "service" | "tyre" | "mileage" | "document" | "bill" | "subscription";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  severity: ReminderSeverity;
  title: string;
  detail: string;
  /** The date it needs doing by, when there is one. */
  dueOn?: string | undefined;
  /** Where in the app to act on it. */
  href: string;
}

export interface VehicleStatus {
  vehicleId: string;
  name: string;
  fuel: VehicleFuel;
  odometerKm: number;
  unit: { mileage: string; quantity: string };
  mileage: {
    rated: number;
    /** Real-world figure from full-tank fills, when there are enough. */
    actual: number | null;
    fillsUsed: number;
    /** How far below the rated figure, in percent. Negative when better. */
    dropPct: number | null;
    state: "unknown" | "ok" | "dropped" | "better";
  };
  fuelLeft: {
    quantity: number;
    percent: number;
    rangeKm: number;
    /** Days of the usual daily distance the fuel will last. */
    daysLeft: number | null;
    refuelBy: string | null;
    low: boolean;
  };
  service: {
    state: "unknown" | "ok" | "due_soon" | "overdue";
    lastOn: string | null;
    lastOdometerKm: number | null;
    nextDueKm: number | null;
    nextDueOn: string | null;
    kmLeft: number | null;
    daysLeft: number | null;
    detail: string;
  };
  tyre: {
    state: "unknown" | "ok" | "check" | "replace";
    ageMonths: number | null;
    kmSince: number | null;
    detail: string;
  };
  suggestions: string[];
  reminders: Reminder[];
}

// ── Defaults ───────────────────────────────────────────────────────────────

const SERVICE_KM: Record<VehicleKind, number> = { car: 10_000, bike: 4_000, scooter: 4_000, auto: 5_000, other: 5_000 };
const SERVICE_MONTHS = 6;
/** Typical tyre life: [km, years]. */
const TYRE_LIFE: Record<VehicleKind, [number, number]> = {
  car: [40_000, 5],
  bike: [25_000, 4],
  scooter: [25_000, 4],
  auto: [30_000, 4],
  other: [30_000, 4],
};
const MIN_FILL_DISTANCE_KM = 40;
const DROP_THRESHOLD_PCT = 15;

const round1 = (n: number) => Math.round(n * 10) / 10;
const km = (n: number) => Math.round(n).toLocaleString("en-IN");

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`);
  const b = new Date(`${toIso}T00:00:00Z`);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

// ── Real mileage from fuel bills ───────────────────────────────────────────

/**
 * Full-to-full method: between two brim-full fills, the fuel put in at the
 * second one (plus any top-ups in between) is what the distance used. Uses the
 * latest three intervals, weighted by distance, so one odd fill cannot swing it.
 */
export function actualMileage(fills: FuelFillRecord[]): { value: number; fillsUsed: number } | null {
  const withOdometer = fills
    .filter((f) => f.odometerKm !== undefined)
    .sort((a, b) => (a.odometerKm ?? 0) - (b.odometerKm ?? 0));
  const intervals: Array<{ distance: number; used: number }> = [];
  let lastFull: FuelFillRecord | undefined;
  let usedSince = 0;
  for (const fill of withOdometer) {
    if (!lastFull) {
      if (fill.fullTank) lastFull = fill;
      continue;
    }
    usedSince += fill.quantity;
    if (!fill.fullTank) continue;
    const distance = (fill.odometerKm ?? 0) - (lastFull.odometerKm ?? 0);
    if (distance >= MIN_FILL_DISTANCE_KM && usedSince > 0) intervals.push({ distance, used: usedSince });
    lastFull = fill;
    usedSince = 0;
  }
  const recent = intervals.slice(-3);
  if (recent.length === 0) return null;
  const distance = recent.reduce((s, i) => s + i.distance, 0);
  const used = recent.reduce((s, i) => s + i.used, 0);
  return { value: round1(distance / used), fillsUsed: recent.length + 1 };
}

/** The figure fuel-left maths should use: real-world when known and sensible, otherwise what the maker rates it at. */
export function effectiveMileage(vehicle: VehicleRecord, fills: FuelFillRecord[]): number {
  const actual = actualMileage(fills.filter((f) => f.vehicleId === vehicle.id));
  if (actual && actual.value > vehicle.mileage * 0.3 && actual.value < vehicle.mileage * 2) return actual.value;
  return vehicle.mileage;
}

// ── Keeping the fuel estimate current ──────────────────────────────────────

/** A fill moves the estimate: brim-full resets it to the tank size, a top-up adds to it. */
export function applyFill(vehicle: VehicleRecord, fill: { quantity: number; fullTank: boolean; odometerKm?: number | undefined }, nowIso: string): VehicleRecord {
  const quantity = fill.fullTank ? vehicle.tankCapacity : Math.min(vehicle.tankCapacity, vehicle.fuelQuantity + fill.quantity);
  return {
    ...vehicle,
    fuelQuantity: round1(quantity),
    fuelAsOf: nowIso,
    odometerKm: fill.odometerKm !== undefined ? Math.max(vehicle.odometerKm, fill.odometerKm) : vehicle.odometerKm,
    updatedAt: nowIso,
  };
}

/** Distance driven in the vehicle uses fuel at its (real-world if known) mileage and advances the odometer. */
export function applyTrip(vehicle: VehicleRecord, fills: FuelFillRecord[], distanceKm: number, nowIso: string): VehicleRecord {
  const used = distanceKm / effectiveMileage(vehicle, fills);
  return {
    ...vehicle,
    fuelQuantity: round1(Math.max(0, vehicle.fuelQuantity - used)),
    fuelAsOf: nowIso,
    odometerKm: Math.round((vehicle.odometerKm + distanceKm) * 10) / 10,
    updatedAt: nowIso,
  };
}

// ── Status ─────────────────────────────────────────────────────────────────

export function vehicleStatus(input: {
  vehicle: VehicleRecord;
  fills: FuelFillRecord[];
  trips?: TripRecord[];
  services: ServiceRecord[];
  today: string;
}): VehicleStatus {
  const { vehicle, today } = input;
  const fills = input.fills.filter((f) => f.vehicleId === vehicle.id);
  const services = input.services.filter((s) => s.vehicleId === vehicle.id);
  const unit = FUEL_UNITS[vehicle.fuel];
  const verb = vehicle.fuel === "electric" ? "Charge" : "Fuel";
  const href = "/onboarding?tab=vehicles";
  const suggestions: string[] = [];
  const reminders: Reminder[] = [];

  // Mileage
  const actual = actualMileage(fills);
  const dropPct = actual ? Math.round(((vehicle.mileage - actual.value) / vehicle.mileage) * 100) : null;
  const mileageState: VehicleStatus["mileage"]["state"] =
    dropPct === null ? "unknown" : dropPct >= DROP_THRESHOLD_PCT ? "dropped" : dropPct <= -10 ? "better" : "ok";

  // Fuel left
  const mileageForRange = effectiveMileage(vehicle, fills);
  const rangeKm = Math.round(vehicle.fuelQuantity * mileageForRange);
  const percent = Math.round((vehicle.fuelQuantity / vehicle.tankCapacity) * 100);
  const daily = vehicle.dailyKm ?? 0;
  // Keep enough to reach a pump: a day and a half of driving, and never less than 40 km.
  const reserveKm = Math.max(40, daily * 1.5);
  const daysLeft = daily > 0 ? Math.floor(rangeKm / daily) : null;
  const refuelBy = daily > 0 ? addDays(today, Math.max(0, Math.floor((rangeKm - reserveKm) / daily))) : null;
  const low = rangeKm <= reserveKm || percent <= 15;

  // Service
  const latestService = [...services]
    .filter((s) => s.kind === "routine")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastOn = latestService?.date ?? vehicle.lastServiceOn ?? null;
  const lastOdo = latestService?.odometerKm ?? vehicle.lastServiceOdometerKm ?? null;
  const intervalKm = vehicle.serviceIntervalKm ?? SERVICE_KM[vehicle.kind];
  const intervalMonths = vehicle.serviceIntervalMonths ?? SERVICE_MONTHS;
  const nextDueKm = lastOdo !== null ? lastOdo + intervalKm : null;
  const nextDueOn = lastOn ? addMonths(lastOn, intervalMonths) : null;
  const kmLeft = nextDueKm !== null ? Math.round(nextDueKm - vehicle.odometerKm) : null;
  const serviceDaysLeft = nextDueOn ? daysBetween(today, nextDueOn) : null;
  let serviceState: VehicleStatus["service"]["state"] = "unknown";
  let serviceDetail = "Add your last service to get reminders.";
  if (lastOn || lastOdo !== null) {
    const overdue = (kmLeft !== null && kmLeft < 0) || (serviceDaysLeft !== null && serviceDaysLeft < 0);
    const soon =
      (kmLeft !== null && kmLeft <= Math.max(300, intervalKm * 0.1)) || (serviceDaysLeft !== null && serviceDaysLeft <= 14);
    serviceState = overdue ? "overdue" : soon ? "due_soon" : "ok";
    const parts: string[] = [];
    if (kmLeft !== null) parts.push(kmLeft < 0 ? `${km(-kmLeft)} km past due` : `${km(kmLeft)} km to go`);
    if (serviceDaysLeft !== null) parts.push(serviceDaysLeft < 0 ? `${-serviceDaysLeft} days past the due date` : `${serviceDaysLeft} days to go`);
    serviceDetail = parts.join(" · ");
  }

  // Tyres
  const [lifeKm, lifeYears] = TYRE_LIFE[vehicle.kind];
  const tyreOn = vehicle.tyreReplacedOn ?? null;
  const tyreOdo = vehicle.tyreReplacedOdometerKm ?? null;
  const tyreKm = tyreOdo !== null ? Math.max(0, Math.round(vehicle.odometerKm - tyreOdo)) : null;
  const tyreMonths = tyreOn ? Math.max(0, monthsBetween(tyreOn, today)) : null;
  const kmUsed = tyreKm !== null ? tyreKm / lifeKm : 0;
  const ageUsed = tyreMonths !== null ? tyreMonths / (lifeYears * 12) : 0;
  const used = Math.max(kmUsed, ageUsed);
  let tyreState: VehicleStatus["tyre"]["state"] = "unknown";
  let tyreDetail = "Tell us when the tyres were last changed.";
  if (vehicle.tyreCondition === "replace_soon" || used >= 1) {
    tyreState = "replace";
  } else if (vehicle.tyreCondition === "worn" || used >= 0.75) {
    tyreState = "check";
  } else if (vehicle.tyreCondition === "good" || tyreOn || tyreOdo !== null) {
    tyreState = "ok";
  }
  if (tyreState !== "unknown") {
    const bits: string[] = [];
    if (tyreKm !== null) bits.push(`${km(tyreKm)} km on this set`);
    if (tyreMonths !== null) bits.push(`${tyreMonths} months old`);
    if (bits.length === 0) bits.push(`marked ${vehicle.tyreCondition.replace("_", " ")}`);
    tyreDetail = bits.join(" · ");
  }

  // Suggestions
  if (mileageState === "dropped" && actual && dropPct !== null) {
    const causes = ["tyre pressure", "air filter", vehicle.fuel === "electric" ? "battery health" : "spark plugs and injectors"];
    if (serviceState === "overdue") causes.unshift("the overdue service");
    if (tyreState === "check" || tyreState === "replace") causes.unshift("worn tyres");
    suggestions.push(
      `Mileage has dropped to ${actual.value} ${unit.mileage} from ${vehicle.mileage} (${dropPct}% lower). Check ${causes.slice(0, 3).join(", ")}.`,
    );
  } else if (mileageState === "better" && actual && dropPct !== null) {
    suggestions.push(`Mileage is ${actual.value} ${unit.mileage}, ${Math.abs(dropPct)}% better than rated. Nice.`);
  } else if (mileageState === "unknown") {
    suggestions.push("Add two full-tank fuel bills with the odometer reading to see your real mileage.");
  }
  if (serviceState === "overdue") suggestions.push(`Service is overdue (${serviceDetail}). Book it soon.`);
  if (tyreState === "replace") suggestions.push(`Tyres look due for replacement (${tyreDetail}).`);
  else if (tyreState === "check") suggestions.push(`Check tyre tread and pressure (${tyreDetail}).`);
  if (vehicle.tyreCondition === "unknown" && tyreOn === null && tyreOdo === null) suggestions.push("Note when the tyres were last replaced so we can remind you.");

  // Reminders
  if (low) {
    reminders.push({
      id: `fuel:${vehicle.id}`,
      kind: "fuel",
      severity: rangeKm <= reserveKm / 2 ? "urgent" : "warning",
      title: `${verb} ${vehicle.name}`,
      detail: `About ${round1(vehicle.fuelQuantity)} ${unit.quantity} left, roughly ${km(rangeKm)} km.`,
      dueOn: refuelBy ?? today,
      href,
    });
  }
  if (serviceState === "overdue" || serviceState === "due_soon") {
    reminders.push({
      id: `service:${vehicle.id}`,
      kind: "service",
      severity: serviceState === "overdue" ? "urgent" : "warning",
      title: `${serviceState === "overdue" ? "Service overdue" : "Service due soon"}: ${vehicle.name}`,
      detail: serviceDetail,
      dueOn: nextDueOn ?? undefined,
      href,
    });
  }
  if (tyreState === "replace" || tyreState === "check") {
    reminders.push({
      id: `tyre:${vehicle.id}`,
      kind: "tyre",
      severity: tyreState === "replace" ? "warning" : "info",
      title: `${tyreState === "replace" ? "Replace tyres" : "Check tyres"}: ${vehicle.name}`,
      detail: tyreDetail,
      href,
    });
  }
  if (mileageState === "dropped" && actual && dropPct !== null) {
    reminders.push({
      id: `mileage:${vehicle.id}`,
      kind: "mileage",
      severity: "warning",
      title: `Mileage has dropped: ${vehicle.name}`,
      detail: `${actual.value} ${unit.mileage} now, ${dropPct}% below the rated ${vehicle.mileage}.`,
      href,
    });
  }

  return {
    vehicleId: vehicle.id,
    name: vehicle.name,
    fuel: vehicle.fuel,
    odometerKm: Math.round(vehicle.odometerKm),
    unit: { mileage: unit.mileage, quantity: unit.quantity },
    mileage: {
      rated: vehicle.mileage,
      actual: actual?.value ?? null,
      fillsUsed: actual?.fillsUsed ?? 0,
      dropPct,
      state: mileageState,
    },
    fuelLeft: {
      quantity: round1(vehicle.fuelQuantity),
      percent,
      rangeKm,
      daysLeft,
      refuelBy,
      low,
    },
    service: {
      state: serviceState,
      lastOn,
      lastOdometerKm: lastOdo,
      nextDueKm,
      nextDueOn,
      kmLeft,
      daysLeft: serviceDaysLeft,
      detail: serviceDetail,
    },
    tyre: { state: tyreState, ageMonths: tyreMonths, kmSince: tyreKm, detail: tyreDetail },
    suggestions,
    reminders,
  };
}
