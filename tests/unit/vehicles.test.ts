import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextBillingDate,
  maskDocumentNumber,
  normalizeIndianPhone,
  obligationTiming,
  emptyHouseholdProfile,
  type DocumentRecord,
  type FuelFillRecord,
  type VehicleRecord,
} from "@household/contracts";
import {
  assistantHousehold,
  actualMileage,
  applyFill,
  applyTrip,
  deriveObligations,
  profileReminders,
  setupProgress,
  vehicleStatus,
} from "@household/life";

const TODAY = "2026-10-01";
const NOW = "2026-10-01T08:00:00.000Z";

const car = (over: Partial<VehicleRecord> = {}): VehicleRecord => ({
  id: "veh1",
  name: "Honda City",
  kind: "car",
  fuel: "petrol",
  odometerKm: 30_000,
  mileage: 16,
  tankCapacity: 40,
  fuelLevelPercent: 100,
  tyreCondition: "unknown",
  dailyKm: 40,
  fuelQuantity: 40,
  fuelAsOf: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const fill = (odometerKm: number, quantity: number, over: Partial<FuelFillRecord> = {}): FuelFillRecord => ({
  id: `f${odometerKm}`,
  vehicleId: "veh1",
  date: "2026-09-01",
  quantity,
  amountInr: quantity * 100,
  odometerKm,
  fullTank: true,
  createdAt: NOW,
  ...over,
});

describe("Real mileage from fuel bills", () => {
  it("works out km per litre between two full-tank fills", () => {
    // 480 km on 40 L = 12 km/l
    assert.deepEqual(actualMileage([fill(1000, 35), fill(1480, 40)]), { value: 12, fillsUsed: 2 });
  });

  it("counts top-ups between two full fills as fuel used", () => {
    // 480 km, 10 L top-up + 30 L final fill = 40 L
    const result = actualMileage([fill(1000, 35), fill(1200, 10, { fullTank: false }), fill(1480, 30)]);
    assert.equal(result?.value, 12);
  });

  it("needs two full fills with odometer readings", () => {
    assert.equal(actualMileage([fill(1000, 35)]), null);
    assert.equal(actualMileage([fill(1000, 35), fill(1010, 1)]), null); // under 40 km apart
  });

  it("warns when mileage has dropped and names likely causes", () => {
    const status = vehicleStatus({
      vehicle: car({ tyreCondition: "worn" }),
      fills: [fill(1000, 35), fill(1480, 40)], // 12 km/l vs rated 16, a 25% drop
      services: [],
      today: TODAY,
    });
    assert.equal(status.mileage.state, "dropped");
    assert.equal(status.mileage.dropPct, 25);
    assert.match(status.suggestions[0] ?? "", /dropped to 12 km\/l from 16/);
    assert.match(status.suggestions[0] ?? "", /worn tyres/);
    assert.ok(status.reminders.some((r) => r.kind === "mileage"));
  });

  it("uses the rated figure until real data exists", () => {
    const status = vehicleStatus({ vehicle: car(), fills: [], services: [], today: TODAY });
    assert.equal(status.mileage.state, "unknown");
    assert.equal(status.mileage.actual, null);
    assert.match(status.suggestions.join(" "), /two full-tank fuel bills/);
  });
});

describe("Fuel left and refuel reminders", () => {
  it("a full fill resets the tank; a top-up adds to it without overflowing", () => {
    const low = car({ fuelQuantity: 5 });
    assert.equal(applyFill(low, { quantity: 30, fullTank: true, odometerKm: 30_100 }, NOW).fuelQuantity, 40);
    assert.equal(applyFill(low, { quantity: 10, fullTank: false }, NOW).fuelQuantity, 15);
    assert.equal(applyFill(low, { quantity: 99, fullTank: false }, NOW).fuelQuantity, 40);
  });

  it("a trip in your own vehicle uses fuel at its mileage and advances the odometer", () => {
    // 160 km at 16 km/l = 10 L
    const after = applyTrip(car(), [], 160, NOW);
    assert.equal(after.fuelQuantity, 30);
    assert.equal(after.odometerKm, 30_160);
  });

  it("uses the real-world mileage once it is known", () => {
    // real mileage 12 km/l, so 120 km = 10 L
    const after = applyTrip(car(), [fill(1000, 35), fill(1480, 40)], 120, NOW);
    assert.equal(after.fuelQuantity, 30);
  });

  it("never goes below empty", () => {
    assert.equal(applyTrip(car({ fuelQuantity: 1 }), [], 1000, NOW).fuelQuantity, 0);
  });

  it("asks you to refuel before the tank is nearly empty, with a date", () => {
    // 4 L * 16 = 64 km range; reserve = max(40, 40*1.5) = 60 km, so it is low
    const status = vehicleStatus({ vehicle: car({ fuelQuantity: 4 }), fills: [], services: [], today: TODAY });
    assert.equal(status.fuelLeft.rangeKm, 64);
    assert.equal(status.fuelLeft.low, true);
    const reminder = status.reminders.find((r) => r.kind === "fuel");
    assert.equal(reminder?.title, "Fuel Honda City");
    assert.match(reminder?.detail ?? "", /4 L left, roughly 64 km/);
  });

  it("stays quiet with plenty of fuel and says how many days it lasts", () => {
    const status = vehicleStatus({ vehicle: car({ fuelQuantity: 30 }), fills: [], services: [], today: TODAY });
    assert.equal(status.fuelLeft.low, false);
    assert.equal(status.fuelLeft.daysLeft, 12); // 480 km / 40 per day
    assert.equal(status.fuelLeft.refuelBy, "2026-10-11"); // (480 - 60) / 40 = 10 days
    assert.equal(status.reminders.filter((r) => r.kind === "fuel").length, 0);
  });

  it("says charge, not fuel, for an electric vehicle", () => {
    const ev = car({ fuel: "electric", name: "Nexon EV", mileage: 6, tankCapacity: 30, fuelQuantity: 3 });
    const status = vehicleStatus({ vehicle: ev, fills: [], services: [], today: TODAY });
    assert.equal(status.reminders.find((r) => r.kind === "fuel")?.title, "Charge Nexon EV");
    assert.equal(status.unit.mileage, "km/kWh");
  });
});

describe("Service and tyres", () => {
  it("flags a service that is overdue by distance", () => {
    const status = vehicleStatus({
      vehicle: car({ odometerKm: 41_500, lastServiceOn: "2026-08-01", lastServiceOdometerKm: 30_000 }),
      fills: [],
      services: [],
      today: TODAY,
    });
    assert.equal(status.service.state, "overdue");
    assert.equal(status.service.kmLeft, -1500);
    assert.match(status.service.detail, /1,500 km past due/);
  });

  it("flags a service that is overdue by time", () => {
    const status = vehicleStatus({
      vehicle: car({ odometerKm: 31_000, lastServiceOn: "2026-01-01", lastServiceOdometerKm: 30_000 }),
      fills: [],
      services: [],
      today: TODAY,
    });
    assert.equal(status.service.state, "overdue");
    assert.equal(status.service.nextDueOn, "2026-07-01");
  });

  it("is due soon inside the last stretch, and ok well before it", () => {
    const soon = vehicleStatus({ vehicle: car({ odometerKm: 39_800, lastServiceOn: "2026-08-15", lastServiceOdometerKm: 30_000 }), fills: [], services: [], today: TODAY });
    assert.equal(soon.service.state, "due_soon");
    const fine = vehicleStatus({ vehicle: car({ odometerKm: 32_000, lastServiceOn: "2026-09-15", lastServiceOdometerKm: 30_000 }), fills: [], services: [], today: TODAY });
    assert.equal(fine.service.state, "ok");
  });

  it("a logged service record takes over from the initial details", () => {
    const status = vehicleStatus({
      vehicle: car({ odometerKm: 41_500, lastServiceOn: "2026-01-01", lastServiceOdometerKm: 30_000 }),
      fills: [],
      services: [{ id: "s1", vehicleId: "veh1", date: "2026-09-25", kind: "routine", odometerKm: 41_000, createdAt: NOW }],
      today: TODAY,
    });
    assert.equal(status.service.state, "ok");
    assert.equal(status.service.lastOdometerKm, 41_000);
  });

  it("does not guess when nothing is known", () => {
    const status = vehicleStatus({ vehicle: car(), fills: [], services: [], today: TODAY });
    assert.equal(status.service.state, "unknown");
    assert.equal(status.reminders.filter((r) => r.kind === "service").length, 0);
  });

  it("judges tyres by distance, age and how you marked them", () => {
    const fresh = vehicleStatus({ vehicle: car({ tyreReplacedOn: "2026-06-01", tyreReplacedOdometerKm: 29_000, tyreCondition: "good" }), fills: [], services: [], today: TODAY });
    assert.equal(fresh.tyre.state, "ok");
    assert.equal(fresh.tyre.kmSince, 1000);
    const old = vehicleStatus({ vehicle: car({ tyreReplacedOn: "2021-01-01", tyreReplacedOdometerKm: 5_000 }), fills: [], services: [], today: TODAY });
    assert.equal(old.tyre.state, "replace");
    const worn = vehicleStatus({ vehicle: car({ tyreCondition: "worn" }), fills: [], services: [], today: TODAY });
    assert.equal(worn.tyre.state, "check");
  });
});

describe("Setup progress", () => {
  const you = { id: "m1", householdId: "h", name: "You", role: "OWNER" as const, relation: "self", age: 34 };
  const doc = (type: DocumentRecord["type"], over: Partial<DocumentRecord> = {}): DocumentRecord => ({ id: `d-${type}`, type, createdAt: NOW, updatedAt: NOW, ...over });

  it("starts at zero for an empty household", () => {
    const p = setupProgress({ profile: emptyHouseholdProfile(), members: [{ ...you, age: undefined }], vendors: [] });
    assert.equal(p.percent, 0);
    assert.equal(p.nextStep, "family");
  });

  it("counts finished and skipped steps", () => {
    const profile = { ...emptyHouseholdProfile(), documents: [doc("aadhaar")], skippedSteps: ["vehicles" as const] };
    const p = setupProgress({ profile, members: [you], vendors: [] });
    assert.equal(p.steps.filter((s) => s.done || s.skipped).length, 3);
    assert.equal(p.percent, 60);
    assert.equal(p.nextStep, "bills");
  });

  it("only identity documents complete the documents step", () => {
    const p = setupProgress({ profile: { ...emptyHouseholdProfile(), documents: [doc("insurance")] }, members: [you], vendors: [] });
    assert.equal(p.steps.find((s) => s.id === "documents")?.done, false);
  });
});

describe("Reminders and obligations from the profile", () => {
  const profile = {
    ...emptyHouseholdProfile(),
    documents: [
      { id: "lic", type: "driving_licence" as const, expiresOn: "2026-10-05", createdAt: NOW, updatedAt: NOW },
      { id: "pan", type: "pan" as const, createdAt: NOW, updatedAt: NOW },
      { id: "ins", type: "insurance" as const, expiresOn: "2027-08-01", createdAt: NOW, updatedAt: NOW },
    ],
    electricityBills: [
      { id: "b1", amountInr: 2140, dueDate: "2026-10-04", paid: false, createdAt: NOW },
      { id: "b2", amountInr: 900, dueDate: "2026-10-03", paid: true, createdAt: NOW },
    ],
  };

  it("nudges about documents expiring soon and unpaid bills, most urgent first", () => {
    const reminders = profileReminders({ profile, today: TODAY });
    assert.deepEqual(reminders.map((r) => r.id), ["bill:b1", "document:lic"]);
    assert.match(reminders[0]?.title ?? "", /Electricity bill due in 3 days/);
    assert.match(reminders[1]?.title ?? "", /Driving licence expires in 4 days/);
  });

  it("turns dated items into obligations with live statuses, skipping paid bills", () => {
    const obligations = deriveObligations({ profile, householdId: "h", today: TODAY });
    const byId = Object.fromEntries(obligations.map((o) => [o.id, o]));
    assert.equal(byId["obl_p_bill:b1"]?.status, "DUE_SOON");
    assert.equal(byId["obl_p_bill:b1"]?.amountInr, 2140);
    assert.equal(byId["obl_p_bill:b2"], undefined);
    assert.equal(byId["obl_p_doc:lic"]?.daysUntilDue, 4);
    assert.equal(byId["obl_p_doc:ins"]?.category, "vehicle");
    assert.equal(byId["obl_p_doc:ins"]?.status, "UPCOMING");
    assert.equal(byId["obl_p_doc:pan"], undefined); // no expiry
  });

  it("works out timing from dates", () => {
    assert.deepEqual(obligationTiming("2026-09-29", TODAY), { daysUntilDue: -2, status: "OVERDUE" });
    assert.deepEqual(obligationTiming("2026-10-15", TODAY), { daysUntilDue: 14, status: "DUE_SOON" });
    assert.deepEqual(obligationTiming("2026-10-16", TODAY), { daysUntilDue: 15, status: "UPCOMING" });
  });
});

describe("Phone numbers and identity masking", () => {
  it("normalises Indian mobile numbers and rejects the rest", () => {
    assert.equal(normalizeIndianPhone("98404 12345"), "+919840412345");
    assert.equal(normalizeIndianPhone("+91-98404-12345"), "+919840412345");
    assert.equal(normalizeIndianPhone("09840412345"), "+919840412345");
    assert.equal(normalizeIndianPhone("1234567890"), null);
    assert.equal(normalizeIndianPhone("98404"), null);
  });

  it("never keeps a full identity number", () => {
    assert.equal(maskDocumentNumber("aadhaar", "1234 5678 9012"), "•••• •••• 9012");
    assert.equal(maskDocumentNumber("pan", "abcde1234f"), "••••••234F");
    assert.equal(maskDocumentNumber("insurance", "POL-2026-778"), "POL-2026-778");
  });
});

describe("What the assistant may know", () => {
  it("includes names, types and dates but never document numbers, phone numbers or addresses", () => {
    const profile = {
      ...emptyHouseholdProfile(),
      documents: [{ id: "d1", type: "aadhaar" as const, numberDisplay: "•••• •••• 9012", expiresOn: "2030-01-01", createdAt: NOW, updatedAt: NOW }],
    };
    const context = assistantHousehold({
      profile,
      members: [{ id: "m", householdId: "h", name: "Asha", role: "OWNER", age: 34, relation: "self", phoneE164: "+919876543210" }],
      vendors: [{ id: "v", householdId: "h", name: "Aavin", kind: "milk", phoneE164: "+918123456789", location: "12 Temple Street", isPreferred: true }],
      vehicleStatuses: [],
    });
    const text = JSON.stringify(context);
    for (const secret of ["9012", "9876543210", "8123456789", "Temple Street"]) assert.ok(!text.includes(secret), `${secret} must not be included`);
    assert.ok(text.includes("Asha") && text.includes("Aavin") && text.includes("2030-01-01"));
  });
});

describe("Billing dates", () => {
  it("moves a subscription forward one cycle and keeps month ends sensible", () => {
    assert.equal(nextBillingDate("2026-10-15", "monthly"), "2026-11-15");
    assert.equal(nextBillingDate("2026-01-31", "monthly"), "2026-02-28");
    assert.equal(nextBillingDate("2028-01-31", "monthly"), "2028-02-29");
    assert.equal(nextBillingDate("2026-12-05", "monthly"), "2027-01-05");
    assert.equal(nextBillingDate("2026-10-15", "quarterly"), "2027-01-15");
    assert.equal(nextBillingDate("2026-10-15", "yearly"), "2027-10-15");
  });
});
