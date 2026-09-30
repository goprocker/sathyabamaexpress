import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { HouseholdStore } from "@household/db";
import { addDays, todayIso } from "@household/life";
import { buildApiApp } from "../../apps/api/src/app.js";
import { encryptedFileStore, MemoryBlobStore } from "../../apps/api/src/file-store.js";
import { MemoryStateBackend } from "../../apps/api/src/state-backend.js";

const KEY = Buffer.alloc(32, 7);
const verifySession = async (token: string) => {
  if (!token.startsWith("user-")) throw new Error("bad token");
  return { userId: token };
};

function make() {
  const blobs = new MemoryBlobStore();
  const file = path.join(os.tmpdir(), `profile-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const app = buildApiApp(new HouseholdStore(file), {
    verifySession,
    stateBackend: new MemoryStateBackend(),
    fileStore: encryptedFileStore(blobs, KEY),
  });
  return { app, blobs };
}
type App = ReturnType<typeof make>["app"];

const as = (token: string) => ({ authorization: `Bearer ${token}` });

function multipart(parts: Array<{ name: string; value?: string; filename?: string; type?: string; data?: Buffer }>) {
  const boundary = `----livora${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (p.filename) {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.type}\r\n\r\n`));
      chunks.push(p.data ?? Buffer.alloc(0));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value ?? ""}`));
    }
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

const get = async (a: App, token: string, url: string) => (await a.inject({ method: "GET", url, headers: as(token) })).json();
const view = (a: App, token: string) => get(a, token, "/api/profile");
const post = (a: App, token: string, url: string, payload: unknown, extra: Record<string, string> = {}) =>
  a.inject({ method: "POST", url, headers: { ...as(token), ...extra }, payload: payload as object });

const upload = (a: App, token: string, url: string, data: unknown, file?: { name: string; type: string; bytes: Buffer }, method: "POST" | "PUT" = "POST") => {
  const m = multipart([
    { name: "data", value: JSON.stringify(data) },
    ...(file ? [{ name: "file", filename: file.name, type: file.type, data: file.bytes }] : []),
  ]);
  return a.inject({ method, url, headers: { ...as(token), "content-type": m.contentType }, payload: m.payload });
};

const car = { name: "Honda City", kind: "car", fuel: "petrol", odometerKm: 30000, mileage: 16, tankCapacity: 40, fuelLevelPercent: 100, dailyKm: 40 };

describe("Setup: family and progress", () => {
  it("starts empty with just you, and progress moves as you fill it in", async () => {
    const { app: a } = make();
    const first = await view(a, "user-a");
    assert.equal(first.progress.percent, 0);
    assert.equal(first.family.length, 1);
    assert.equal(first.vendors.length, 0);
    assert.equal(first.uploadsEnabled, true);
    assert.equal(first.startedAt, null);
    await post(a, "user-a", "/api/profile/start", {});
    assert.ok((await view(a, "user-a")).startedAt);

    await a.inject({ method: "PUT", url: "/api/profile/me", headers: as("user-a"), payload: { name: "Asha", age: 34, relation: "self" } });
    const after = await view(a, "user-a");
    assert.equal(after.family[0].name, "Asha");
    assert.equal(after.family[0].age, 34);
    assert.equal(after.progress.steps.find((s: { id: string }) => s.id === "family").done, true);
    await a.close();
  });

  it("adds, edits and removes family members but never removes you", async () => {
    const { app: a } = make();
    const created = await post(a, "user-a", "/api/profile/family", { name: "Ravi", age: 8, relation: "child" });
    const { id } = created.json();
    await a.inject({ method: "PUT", url: `/api/profile/family/${id}`, headers: as("user-a"), payload: { name: "Ravi K", age: 9, relation: "child" } });
    let family = (await view(a, "user-a")).family;
    assert.deepEqual(family.filter((m: { id: string }) => m.id === id).map((m: { name: string; age: number }) => [m.name, m.age]), [["Ravi K", 9]]);

    const me = family.find((m: { relation: string }) => m.relation === "self");
    assert.equal((await a.inject({ method: "DELETE", url: `/api/profile/family/${me.id}`, headers: as("user-a") })).statusCode, 400);
    assert.equal((await a.inject({ method: "DELETE", url: `/api/profile/family/${id}`, headers: as("user-a") })).statusCode, 200);
    family = (await view(a, "user-a")).family;
    assert.equal(family.length, 1);
    await a.close();
  });

  it("rejects an impossible age and lets a step be skipped", async () => {
    const { app: a } = make();
    assert.equal((await post(a, "user-a", "/api/profile/family", { name: "X", age: 200, relation: "child" })).statusCode, 400);
    await post(a, "user-a", "/api/profile/skip", { step: "vehicles", skipped: true });
    const p = await view(a, "user-a");
    assert.equal(p.progress.steps.find((s: { id: string }) => s.id === "vehicles").skipped, true);
    assert.equal((await post(a, "user-a", "/api/profile/skip", { step: "family", skipped: true })).statusCode, 400);
    await a.close();
  });
});

describe("Setup: documents", () => {
  const photo = { name: "aadhaar.jpg", type: "image/jpeg", bytes: Buffer.from("PRIVATE-AADHAAR-IMAGE-BYTES") };

  it("masks identity numbers and stores files encrypted, readable only by their owner", async () => {
    const { app: a, blobs } = make();
    const res = await upload(a, "user-a", "/api/profile/documents", { type: "aadhaar", number: "1234 5678 9012" }, photo);
    assert.equal(res.statusCode, 200);
    const { id } = res.json();

    const list = await view(a, "user-a");
    const doc = list.documents.find((d: { id: string }) => d.id === id);
    assert.equal(doc.numberDisplay, "•••• •••• 9012");
    assert.equal(doc.label, "Aadhaar card");
    assert.ok(!JSON.stringify(list).includes("123456789012"), "the full number must never be returned");
    assert.ok(!JSON.stringify(list).includes("1234 5678"), "the full number must never be returned");

    // Nothing readable at rest.
    const stored = [...blobs.blobs.values()][0]?.blob;
    assert.ok(stored && !stored.includes(Buffer.from("PRIVATE-AADHAAR-IMAGE-BYTES")));

    // The owner gets the exact bytes back; another user cannot.
    const back = await a.inject({ method: "GET", url: `/api/profile/documents/${id}/file`, headers: as("user-a") });
    assert.equal(back.statusCode, 200);
    assert.equal(back.headers["content-type"], "image/jpeg");
    assert.equal(back.headers["cache-control"], "private, no-store");
    assert.deepEqual(back.rawPayload, photo.bytes);
    assert.equal((await a.inject({ method: "GET", url: `/api/profile/documents/${id}/file`, headers: as("user-b") })).statusCode, 404);
    await a.close();
  });

  it("refuses files that are the wrong type or too large", async () => {
    const { app: a } = make();
    const wrong = await upload(a, "user-a", "/api/profile/documents", { type: "pan" }, { name: "x.exe", type: "application/x-msdownload", bytes: Buffer.from("MZ") });
    assert.equal(wrong.statusCode, 400);
    const big = await upload(a, "user-a", "/api/profile/documents", { type: "pan" }, { name: "big.pdf", type: "application/pdf", bytes: Buffer.alloc(3 * 1024 * 1024 + 1, 1) });
    assert.equal(big.statusCode, 413);
    assert.equal((await view(a, "user-a")).documents.length, 0);
    await a.close();
  });

  it("deleting a document deletes its stored file", async () => {
    const { app: a, blobs } = make();
    const { id } = (await upload(a, "user-a", "/api/profile/documents", { type: "pan", number: "ABCDE1234F" }, photo)).json();
    assert.equal(blobs.blobs.size, 1);
    await a.inject({ method: "DELETE", url: `/api/profile/documents/${id}`, headers: as("user-a") });
    assert.equal(blobs.blobs.size, 0);
    assert.equal((await view(a, "user-a")).documents.length, 0);
    await a.close();
  });

  it("an expiry date becomes a reminder, a Life Admin obligation and a notification", async () => {
    const { app: a } = make();
    await upload(a, "user-a", "/api/profile/documents", { type: "driving_licence", expiresOn: addDays(todayIso(), 5) });
    const p = await view(a, "user-a");
    assert.ok(p.reminders.some((r: { title: string }) => /Driving licence expires in 5 days/.test(r.title)));

    const obligations = (await get(a, "user-a", "/api/obligations")).obligations;
    const o = obligations.find((x: { title: string }) => /Driving licence/.test(x.title));
    assert.equal(o?.status, "DUE_SOON");

    const notes = await get(a, "user-a", "/api/notifications");
    assert.ok(notes.groups.some((g: { items: Array<{ title: string }> }) => g.items.some((i) => /Driving licence/.test(i.title))));
    await a.close();
  });

  it("only signed-in users can store files; demo mode still takes the details", async () => {
    const file = path.join(os.tmpdir(), `profile-demo-${Date.now()}.json`);
    const demo = buildApiApp(new HouseholdStore(file));
    const withFile = await upload(demo, "", "/api/profile/documents", { type: "pan" }, { name: "a.jpg", type: "image/jpeg", bytes: Buffer.from("x") });
    assert.equal(withFile.statusCode, 403);
    const noFile = await upload(demo, "", "/api/profile/documents", { type: "pan", number: "ABCDE1234F" });
    assert.equal(noFile.statusCode, 200);
    await demo.close();
  });
});

describe("Setup: vehicles, fuel and service", () => {
  const create = async (a: App, token = "user-a", over: Record<string, unknown> = {}) => (await post(a, token, "/api/profile/vehicles", { ...car, ...over })).json().id as string;
  const vehicle = async (a: App, token = "user-a") => (await view(a, token)).vehicles[0];

  it("adds a vehicle and shows how much fuel it has", async () => {
    const { app: a } = make();
    await create(a);
    const v = await vehicle(a);
    assert.equal(v.status.fuelLeft.quantity, 40);
    assert.equal(v.status.fuelLeft.rangeKm, 640);
    assert.equal(v.status.service.state, "unknown");
    await a.close();
  });

  it("a trip in your own vehicle uses fuel at its mileage, and low fuel raises a reminder", async () => {
    const { app: a } = make();
    const id = await create(a);
    const t1 = await post(a, "user-a", "/api/profile/trips", { date: todayIso(), mode: "own_vehicle", vehicleId: id, distanceKm: 400 });
    assert.equal(t1.json().fuelLeft.quantity, 15); // 400 km / 16 = 25 L used

    assert.equal((await view(a, "user-a")).reminders.filter((r: { kind: string }) => r.kind === "fuel").length, 0);
    await post(a, "user-a", "/api/profile/trips", { date: todayIso(), mode: "own_vehicle", vehicleId: id, distanceKm: 200 });
    const p = await view(a, "user-a");
    const fuel = p.reminders.find((r: { kind: string }) => r.kind === "fuel");
    assert.equal(fuel?.title, "Fuel Honda City");
    assert.match(fuel?.detail, /2\.5 L left, roughly 40 km/);
    assert.equal(p.vehicles[0].vehicle.odometerKm, 30600);

    const notes = await get(a, "user-a", "/api/notifications");
    assert.ok(notes.groups.some((g: { items: Array<{ title: string }> }) => g.items.some((i) => i.title === "Fuel Honda City")));
    await a.close();
  });

  it("other travel modes use no fuel, and a trip needs a vehicle when you drive", async () => {
    const { app: a } = make();
    await create(a);
    await post(a, "user-a", "/api/profile/trips", { date: todayIso(), mode: "metro", distanceKm: 20 });
    assert.equal((await vehicle(a)).status.fuelLeft.quantity, 40);
    assert.equal((await post(a, "user-a", "/api/profile/trips", { date: todayIso(), mode: "own_vehicle", distanceKm: 20 })).statusCode, 400);
    await a.close();
  });

  it("fuel bills give the real mileage and a warning when it has dropped", async () => {
    const { app: a } = make();
    const id = await create(a);
    const fill = (date: string, quantity: number, odometerKm: number) =>
      upload(a, "user-a", `/api/profile/vehicles/${id}/fuel`, { date, quantity, amountInr: quantity * 100, odometerKm, fullTank: true },
        { name: "bill.jpg", type: "image/jpeg", bytes: Buffer.from("bill") });
    assert.equal((await fill("2026-09-01", 35, 30000)).statusCode, 200);
    assert.equal((await fill("2026-09-20", 40, 30480)).statusCode, 200); // 480 km on 40 L = 12 km/l
    const v = await vehicle(a);
    assert.equal(v.status.mileage.actual, 12);
    assert.equal(v.status.mileage.state, "dropped");
    assert.match(v.status.suggestions[0], /Mileage has dropped to 12 km\/l from 16/);
    assert.equal(v.status.fuelLeft.quantity, 40); // brim-full fill
    assert.equal(v.recentFills.length, 2);
    await a.close();
  });

  it("refuses a fuel quantity larger than the tank", async () => {
    const { app: a } = make();
    const id = await create(a);
    const res = await upload(a, "user-a", `/api/profile/vehicles/${id}/fuel`, { date: todayIso(), quantity: 90, amountInr: 9000, fullTank: false });
    assert.equal(res.statusCode, 400);
    await a.close();
  });

  it("service records drive the reminders, and replacing tyres resets them", async () => {
    const { app: a } = make();
    const id = await create(a, "user-a", { lastServiceOn: "2026-01-01", lastServiceOdometerKm: 20000, odometerKm: 31000, tyreCondition: "worn" });
    let v = await vehicle(a);
    assert.equal(v.status.service.state, "overdue");
    assert.equal(v.status.tyre.state, "check");
    assert.ok((await view(a, "user-a")).reminders.some((r: { kind: string }) => r.kind === "service"));

    await post(a, "user-a", `/api/profile/vehicles/${id}/services`, { date: todayIso(), kind: "routine", odometerKm: 31000 });
    await post(a, "user-a", `/api/profile/vehicles/${id}/services`, { date: todayIso(), kind: "tyre", odometerKm: 31000 });
    v = await vehicle(a);
    assert.equal(v.status.service.state, "ok");
    assert.equal(v.status.tyre.state, "ok");
    assert.equal(v.vehicle.tyreCondition, "good");
    assert.equal(v.recentServices.length, 2);
    await a.close();
  });

  it("editing a vehicle keeps its fuel estimate unless you correct it", async () => {
    const { app: a } = make();
    const id = await create(a);
    await post(a, "user-a", "/api/profile/trips", { date: todayIso(), mode: "own_vehicle", vehicleId: id, distanceKm: 400 });
    const before = (await vehicle(a)).status.fuelLeft;
    await a.inject({ method: "PUT", url: `/api/profile/vehicles/${id}`, headers: as("user-a"), payload: { ...car, name: "City", fuelLevelPercent: before.percent } });
    let v = await vehicle(a);
    assert.equal(v.vehicle.name, "City");
    assert.equal(v.status.fuelLeft.quantity, before.quantity);

    await a.inject({ method: "PUT", url: `/api/profile/vehicles/${id}`, headers: as("user-a"), payload: { ...car, fuelLevelPercent: 50 } });
    v = await vehicle(a);
    assert.equal(v.status.fuelLeft.quantity, 20);
    await a.close();
  });

  it("removing a vehicle removes its history and stored bills", async () => {
    const { app: a, blobs } = make();
    const id = await create(a);
    await upload(a, "user-a", `/api/profile/vehicles/${id}/fuel`, { date: todayIso(), quantity: 10, amountInr: 1000, fullTank: false }, { name: "b.jpg", type: "image/jpeg", bytes: Buffer.from("b") });
    assert.equal(blobs.blobs.size, 1);
    await a.inject({ method: "DELETE", url: `/api/profile/vehicles/${id}`, headers: as("user-a") });
    assert.equal(blobs.blobs.size, 0);
    assert.equal((await view(a, "user-a")).vehicles.length, 0);
    await a.close();
  });

  it("adding the same vehicle twice with one idempotency key adds one", async () => {
    const { app: a } = make();
    const headers = { "idempotency-key": "veh-once" };
    await post(a, "user-a", "/api/profile/vehicles", car, headers);
    await post(a, "user-a", "/api/profile/vehicles", car, headers);
    assert.equal((await view(a, "user-a")).vehicles.length, 1);
    await a.close();
  });
});

describe("Setup: electricity bills and vendors", () => {
  it("an unpaid bill becomes an obligation and a reminder; paying it clears both", async () => {
    const { app: a } = make();
    const { id } = (await upload(a, "user-a", "/api/profile/bills/electricity", { amountInr: 2140, dueDate: addDays(todayIso(), 3), units: 310, consumerNo: "12-345" })).json();
    let p = await view(a, "user-a");
    assert.equal(p.bills[0].status, "DUE_SOON");
    assert.ok(p.reminders.some((r: { kind: string }) => r.kind === "bill"));
    const obl = (await get(a, "user-a", "/api/obligations")).obligations;
    assert.equal(obl.find((o: { title: string }) => o.title === "Electricity bill")?.amountInr, 2140);

    await a.inject({ method: "PATCH", url: `/api/profile/bills/electricity/${id}`, headers: as("user-a"), payload: { paid: true } });
    p = await view(a, "user-a");
    assert.equal(p.reminders.filter((r: { kind: string }) => r.kind === "bill").length, 0);
    assert.equal((await get(a, "user-a", "/api/obligations")).obligations.some((o: { title: string }) => o.title === "Electricity bill"), false);
    await a.close();
  });

  it("adds vendors with a cleaned phone number and one favourite per kind", async () => {
    const { app: a } = make();
    const v1 = (await post(a, "user-a", "/api/profile/vendors", { name: "Murugan Chicken", kind: "poultry", phone: "98404 12345", location: "Adyar market", isPreferred: true })).json().id;
    const v2 = (await post(a, "user-a", "/api/profile/vendors", { name: "Selvam Poultry", kind: "poultry", phone: "+91 90000 11111", isPreferred: true })).json().id;
    await post(a, "user-a", "/api/profile/vendors", { name: "Aavin Milk", kind: "milk", phone: "8123456789", isPreferred: true });

    const vendors = (await view(a, "user-a")).vendors;
    const byId = Object.fromEntries(vendors.map((v: { id: string }) => [v.id, v]));
    assert.equal(byId[v1].phoneE164, "+919840412345");
    assert.equal(byId[v1].location, "Adyar market");
    assert.equal(byId[v1].isPreferred, false);
    assert.equal(byId[v2].isPreferred, true);
    assert.equal(vendors.filter((v: { kind: string; isPreferred: boolean }) => v.kind === "milk" && v.isPreferred).length, 1);

    assert.equal((await post(a, "user-a", "/api/profile/vendors", { name: "Bad", kind: "milk", phone: "12345" })).statusCode, 400);
    await a.inject({ method: "DELETE", url: `/api/profile/vendors/${v1}`, headers: as("user-a") });
    assert.equal((await view(a, "user-a")).vendors.length, 2);
    await a.close();
  });
});

describe("Setup: privacy and reading bills", () => {
  it("keeps every user's profile, files and reminders to themselves", async () => {
    const { app: a } = make();
    await upload(a, "user-a", "/api/profile/documents", { type: "aadhaar", number: "1234 5678 9012" }, { name: "a.jpg", type: "image/jpeg", bytes: Buffer.from("a") });
    await post(a, "user-a", "/api/profile/vendors", { name: "Aavin", kind: "milk", phone: "8123456789" });
    await post(a, "user-a", "/api/profile/vehicles", car);
    const b = await view(a, "user-b");
    assert.equal(b.documents.length, 0);
    assert.equal(b.vehicles.length, 0);
    assert.equal(b.vendors.length, 0);
    assert.equal(b.progress.percent, 0);
    await a.close();
  });

  it("reading a bill needs a photo and a configured key, and saves nothing", async () => {
    const { app: a } = make();
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "";
    try {
      const m = multipart([{ name: "kind", value: "fuel_bill" }, { name: "file", filename: "b.jpg", type: "image/jpeg", data: Buffer.from("x") }]);
      const noKey = await a.inject({ method: "POST", url: "/api/profile/extract", headers: { ...as("user-a"), "content-type": m.contentType }, payload: m.payload });
      assert.equal(noKey.statusCode, 503);
      const pdf = multipart([{ name: "kind", value: "fuel_bill" }, { name: "file", filename: "b.pdf", type: "application/pdf", data: Buffer.from("x") }]);
      const notImage = await a.inject({ method: "POST", url: "/api/profile/extract", headers: { ...as("user-a"), "content-type": pdf.contentType }, payload: pdf.payload });
      assert.equal(notImage.statusCode, 400);
      assert.equal((await view(a, "user-a")).vehicles.length, 0);
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
    await a.close();
  });
});
