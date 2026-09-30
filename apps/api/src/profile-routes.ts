// The Setup section's API: family, identity and vehicle documents, vehicles with
// fuel and service history, electricity bills and local vendors. Rules (mileage,
// fuel left, reminders, completion) come from @household/life; this file only
// validates input, stores records and shapes responses.
import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  DOCUMENT_FILE_TYPES,
  DOCUMENT_LABELS,
  DocumentInputSchema,
  ElectricityBillInputSchema,
  FamilyMemberInputSchema,
  FuelFillInputSchema,
  MASKED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  SETUP_STEP_IDS,
  SUBSCRIPTION_CATALOG,
  SubscriptionInputSchema,
  ServiceRecordInputSchema,
  TripInputSchema,
  VehicleInputSchema,
  VendorInputSchema,
  emptyHouseholdProfile,
  maskDocumentNumber,
  nextBillingDate,
  obligationTiming,
  type DocumentInput,
  type DocumentRecord,
  type HouseholdProfile,
  type Member,
  type StoredFileRef,
  type SubscriptionInput,
  type SubscriptionRecord,
  type VehicleRecord,
  type Vendor,
  type VendorInput,
} from "@household/contracts";
import type { CanonicalStateData, HouseholdStore } from "@household/db";
import { extractBillWithVision } from "@household/integrations";
import {
  PROFILE_OBLIGATION_PREFIX,
  type ProfileView,
  applyFill,
  applyTrip,
  daysBetween,
  deriveObligations,
  profileReminders,
  setupProgress,
  todayIso,
  vehicleStatus,
} from "@household/life";
import type { FileStore } from "./file-store.js";
import { currentUser } from "./request-context.js";

const MAX_FILES_PER_HOUSEHOLD = 80;
const round1 = (n: number) => Math.round(n * 10) / 10;

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

interface UploadedFile {
  name: string;
  mimeType: string;
  bytes: Buffer;
}

/** Reads a multipart request: a JSON `data` field and at most one file. */
async function readUpload(request: FastifyRequest): Promise<{ fields: Record<string, string>; file?: UploadedFile }> {
  if (!request.isMultipart()) throw new HttpError(400, "Send the details as a form upload.");
  const fields: Record<string, string> = {};
  let file: UploadedFile | undefined;
  for await (const part of request.parts()) {
    if (part.type === "file") {
      const bytes = await part.toBuffer();
      if (bytes.length === 0) continue;
      if (bytes.length > MAX_DOCUMENT_BYTES) throw new HttpError(413, "That file is too large. The limit is 3 MB.");
      if (!(DOCUMENT_FILE_TYPES as readonly string[]).includes(part.mimetype)) {
        throw new HttpError(400, "Upload a photo (JPG, PNG, WebP) or a PDF.");
      }
      file = { name: part.filename?.slice(0, 120) || "upload", mimeType: part.mimetype, bytes };
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return file ? { fields, file } : { fields };
}

function parseData<T>(schema: { parse(input: unknown): T }, fields: Record<string, string>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(fields.data ?? "{}");
  } catch {
    throw new HttpError(400, "The details were not valid.");
  }
  return schema.parse(raw);
}

export function registerProfileRoutes(app: FastifyInstance, store: HouseholdStore, files: FileStore | null) {
  const householdId = () => store.getState().households[0]?.id ?? "hh_demo_001";
  /** Households saved before a section existed lack its list; fill in the blanks so every list is always an array. */
  const profileOf = (state: CanonicalStateData): HouseholdProfile => ({ ...emptyHouseholdProfile(), ...state.profile });
  const isDemo = () => store.getState().isDemo === true;

  /** Files hold identity documents, so they only exist for a signed-in user and only when a key is configured. */
  const uploadsEnabled = () => Boolean(files && currentUser()) && !isDemo();

  const saveFile = async (file: UploadedFile): Promise<StoredFileRef> => {
    const user = currentUser();
    if (isDemo()) throw new HttpError(403, "The demo doesn't store files. Sign up to keep your own documents.");
    if (!files || !user) {
      throw new HttpError(403, "Sign in to store documents. Files are kept encrypted against your account.");
    }
    const p = profileOf(store.getState());
    const count = p.documents.filter((d) => d.file).length + p.fuelFills.filter((f) => f.file).length + p.electricityBills.filter((b) => b.file).length;
    if (count >= MAX_FILES_PER_HOUSEHOLD) throw new HttpError(400, "You have reached the limit of stored files. Delete some first.");
    const ref: StoredFileRef = { id: newId("file"), name: file.name, mimeType: file.mimeType, sizeBytes: file.bytes.length };
    await files.put(user.userId, { id: ref.id, name: ref.name, mimeType: ref.mimeType }, file.bytes);
    return ref;
  };

  const dropFile = async (ref: StoredFileRef | undefined) => {
    const user = currentUser();
    if (ref && files && user) await files.delete(user.userId, ref.id).catch(() => undefined);
  };

  /** Dated items in the profile are mirrored into the household's obligations, so Life Admin, the timeline and forecasts see them. */
  const syncObligations = (draft: CanonicalStateData) => {
    const id = draft.households[0]?.id ?? "hh_demo_001";
    draft.obligations = draft.obligations.filter((o) => !o.sourceEventId?.startsWith(PROFILE_OBLIGATION_PREFIX));
    draft.obligations.push(...deriveObligations({ profile: draft.profile ?? emptyHouseholdProfile(), householdId: id, today: todayIso() }));
  };

  const change = <T>(operation: string, entityId: string, fn: (profile: HouseholdProfile, draft: CanonicalStateData) => T): T =>
    store.mutate(
      (draft) => {
        draft.profile = { ...emptyHouseholdProfile(), ...draft.profile };
        const out = fn(draft.profile, draft);
        syncObligations(draft);
        return out;
      },
      { householdId: householdId(), actor: "Setup", operation, entityType: "Profile", entityId },
    );

  const note = (draft: CanonicalStateData, title: string, description: string) => {
    const now = new Date();
    draft.timeline.unshift({
      id: newId("tl"),
      householdId: draft.households[0]?.id ?? "hh_demo_001",
      eventId: "profile",
      timestamp: now.toISOString(),
      timeFormatted: now.toTimeString().slice(0, 5),
      title,
      description,
      category: "obligation",
      status: "SUCCESS",
    });
  };

  /** Repeating a create request with the same key returns the first result instead of adding a duplicate. */
  const once = async <T>(request: FastifyRequest, fn: () => Promise<T> | T): Promise<T> => {
    const key = request.headers["idempotency-key"];
    const cacheKey = typeof key === "string" && key ? `setup:${key}` : undefined;
    const cached = store.getIdempotentResult<T>(cacheKey);
    if (cached) return cached;
    const result = await fn();
    store.setIdempotentResult(cacheKey, result);
    return result;
  };

  const findVehicle = (profile: HouseholdProfile, id: string): VehicleRecord => {
    const vehicle = profile.vehicles.find((v) => v.id === id);
    if (!vehicle) throw new HttpError(404, "Vehicle not found.");
    return vehicle;
  };

  // ── The whole profile ────────────────────────────────────────────────────

  const buildView = (): ProfileView => {
    const state = store.getState();
    const profile = profileOf(state);
    const today = todayIso();
    const members = state.members.filter((m) => m.householdId === householdId());
    const vendors = state.vendors.filter((v) => v.householdId === householdId());
    const statuses = profile.vehicles.map((vehicle) =>
      vehicleStatus({ vehicle, fills: profile.fuelFills, trips: profile.trips, services: profile.serviceRecords, today }),
    );
    const byDateDesc = <T extends { date: string; createdAt: string }>(list: T[]) =>
      [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    return {
      startedAt: profile.startedAt ?? null,
      uploadsEnabled: uploadsEnabled(),
      progress: setupProgress({ profile, members, vendors }),
      family: members,
      documents: profile.documents.map((d) => ({
        ...d,
        label: d.label || DOCUMENT_LABELS[d.type],
        typeLabel: DOCUMENT_LABELS[d.type],
        daysToExpiry: d.expiresOn ? daysBetween(today, d.expiresOn) : null,
      })),
      vehicles: profile.vehicles.map((vehicle, i) => ({
        vehicle,
        status: statuses[i],
        recentFills: byDateDesc(profile.fuelFills.filter((f) => f.vehicleId === vehicle.id)).slice(0, 6),
        recentServices: byDateDesc(profile.serviceRecords.filter((s) => s.vehicleId === vehicle.id)).slice(0, 6),
        recentTrips: byDateDesc(profile.trips.filter((t) => t.vehicleId === vehicle.id)).slice(0, 6),
      })),
      bills: profile.electricityBills
        .map((b) => ({ ...b, ...obligationTiming(b.dueDate, today) }))
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
      subscriptions: (profile.subscriptions ?? [])
        .map((sub) => ({ ...sub, ...obligationTiming(sub.nextDueOn, today) }))
        .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn)),
      isDemo: isDemo(),
      vendors,
      reminders: profileReminders({ profile, today, vehicleStatuses: statuses }),
    };
  };

  app.get("/api/profile", async () => buildView());

  // Called when the Setup page is opened, so the app stops steering a returning user back to it.
  app.post("/api/profile/start", async () => {
    if (!profileOf(store.getState()).startedAt) {
      change("SETUP_STARTED", "profile", (p) => {
        p.startedAt = new Date().toISOString();
      });
    }
    return { ok: true };
  });

  app.post("/api/profile/skip", async (request) => {
    const body = z
      .object({ step: z.enum(SETUP_STEP_IDS).exclude(["family"]), skipped: z.boolean() })
      .parse(request.body ?? {});
    change("SETUP_STEP_SKIPPED", body.step, (p) => {
      const set = new Set(p.skippedSteps ?? []);
      if (body.skipped) set.add(body.step);
      else set.delete(body.step);
      p.skippedSteps = [...set];
    });
    return { ok: true };
  });

  // ── Family ───────────────────────────────────────────────────────────────

  const isOwner = (m: Member) => m.relation === "self" || m.role === "OWNER";

  app.put("/api/profile/me", async (request) => {
    const body = FamilyMemberInputSchema.parse(request.body ?? {});
    change("FAMILY_ME_UPDATED", "me", (_p, draft) => {
      const me = draft.members.find(isOwner);
      if (!me) throw new HttpError(404, "Profile not found.");
      me.name = body.name;
      me.age = body.age;
      me.relation = "self";
      if (body.dietaryPreferences) me.dietaryPreferences = body.dietaryPreferences;
      if (body.phone) me.phoneE164 = body.phone;
    });
    return { ok: true };
  });

  app.post("/api/profile/family", async (request) => {
    const body = FamilyMemberInputSchema.parse(request.body ?? {});
    return once(request, () => {
      const id = newId("mem");
      change("FAMILY_ADDED", id, (_p, draft) => {
        const member: Member = { id, householdId: draft.households[0]?.id ?? "hh_demo_001", name: body.name, role: "MEMBER", age: body.age, relation: body.relation };
        if (body.dietaryPreferences) member.dietaryPreferences = body.dietaryPreferences;
        if (body.phone) member.phoneE164 = body.phone;
        draft.members.push(member);
      });
      return { ok: true, id };
    });
  });

  app.put("/api/profile/family/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = FamilyMemberInputSchema.parse(request.body ?? {});
    change("FAMILY_UPDATED", id, (_p, draft) => {
      const member = draft.members.find((m) => m.id === id);
      if (!member) throw new HttpError(404, "Family member not found.");
      member.name = body.name;
      member.age = body.age;
      if (!isOwner(member)) member.relation = body.relation;
      member.dietaryPreferences = body.dietaryPreferences ?? [];
      if (body.phone) member.phoneE164 = body.phone;
      else delete member.phoneE164;
    });
    return { ok: true };
  });

  app.delete("/api/profile/family/:id", async (request) => {
    const { id } = request.params as { id: string };
    change("FAMILY_REMOVED", id, (_p, draft) => {
      const member = draft.members.find((m) => m.id === id);
      if (!member) throw new HttpError(404, "Family member not found.");
      if (isOwner(member)) throw new HttpError(400, "You can't remove yourself.");
      draft.members = draft.members.filter((m) => m.id !== id);
    });
    return { ok: true };
  });

  // ── Documents ────────────────────────────────────────────────────────────

  const buildDocument = (input: DocumentInput, id: string, now: string, file: StoredFileRef | undefined, existing?: DocumentRecord): DocumentRecord => {
    const { number, ...rest } = input;
    const record: DocumentRecord = { ...rest, id, createdAt: existing?.createdAt ?? now, updatedAt: now };
    const shown = number ? maskDocumentNumber(input.type, number) : MASKED_DOCUMENT_TYPES.has(input.type) ? existing?.numberDisplay : undefined;
    if (shown) record.numberDisplay = shown;
    if (file) record.file = file;
    return record;
  };

  app.post("/api/profile/documents", async (request) => {
    const upload = await readUpload(request);
    const input = parseData(DocumentInputSchema, upload.fields);
    return once(request, async () => {
      const id = newId("doc");
      const ref = upload.file ? await saveFile(upload.file) : undefined;
      change("DOCUMENT_ADDED", id, (p, draft) => {
        const record = buildDocument(input, id, new Date().toISOString(), ref);
        p.documents.push(record);
        note(draft, `${DOCUMENT_LABELS[input.type]} added`, input.expiresOn ? `Valid until ${input.expiresOn}` : "Stored in your Setup documents");
      });
      return { ok: true, id };
    });
  });

  app.put("/api/profile/documents/:id", async (request) => {
    const { id } = request.params as { id: string };
    const upload = await readUpload(request);
    const input = parseData(DocumentInputSchema, upload.fields);
    const existing = profileOf(store.getState()).documents.find((d) => d.id === id);
    if (!existing) throw new HttpError(404, "Document not found.");
    const ref = upload.file ? await saveFile(upload.file) : existing.file;
    change("DOCUMENT_UPDATED", id, (p) => {
      p.documents = p.documents.map((d) => (d.id === id ? buildDocument(input, id, new Date().toISOString(), ref, d) : d));
    });
    if (upload.file) await dropFile(existing.file);
    return { ok: true };
  });

  app.delete("/api/profile/documents/:id", async (request) => {
    const { id } = request.params as { id: string };
    const existing = profileOf(store.getState()).documents.find((d) => d.id === id);
    if (!existing) throw new HttpError(404, "Document not found.");
    change("DOCUMENT_REMOVED", id, (p) => {
      p.documents = p.documents.filter((d) => d.id !== id);
    });
    await dropFile(existing.file);
    return { ok: true };
  });

  /** Serves a stored file back to its owner, decrypted. Never cached. */
  const sendFile = async (ref: StoredFileRef | undefined, reply: import("fastify").FastifyReply) => {
    const user = currentUser();
    if (!ref || !files || !user) throw new HttpError(404, "No file stored.");
    const stored = await files.get(user.userId, ref.id).catch(() => null);
    if (!stored) throw new HttpError(404, "The stored file could not be found.");
    return reply
      .header("Content-Type", stored.mimeType)
      .header("Content-Disposition", `inline; filename="${stored.name.replace(/[^\w.\- ]/g, "_")}"`)
      .header("Cache-Control", "private, no-store")
      .send(stored.bytes);
  };

  app.get("/api/profile/documents/:id/file", async (request, reply) => {
    const { id } = request.params as { id: string };
    return sendFile(profileOf(store.getState()).documents.find((d) => d.id === id)?.file, reply);
  });

  // ── Vehicles ─────────────────────────────────────────────────────────────

  app.post("/api/profile/vehicles", async (request) => {
    const input = VehicleInputSchema.parse(request.body ?? {});
    return once(request, () => {
      const id = newId("veh");
      const now = new Date().toISOString();
      change("VEHICLE_ADDED", id, (p, draft) => {
        p.vehicles.push({ ...input, id, fuelQuantity: round1((input.tankCapacity * input.fuelLevelPercent) / 100), fuelAsOf: now, createdAt: now, updatedAt: now });
        note(draft, `${input.name} added`, `${input.fuel} · ${input.mileage} per unit rated`);
      });
      return { ok: true, id };
    });
  });

  app.put("/api/profile/vehicles/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = VehicleInputSchema.parse(request.body ?? {});
    change("VEHICLE_UPDATED", id, (p) => {
      const current = findVehicle(p, id);
      const currentPercent = (current.fuelQuantity / current.tankCapacity) * 100;
      // The form sends the fuel level it was showing. Only treat it as a correction when the user changed it.
      const corrected = Math.abs(input.fuelLevelPercent - currentPercent) >= 1;
      const now = new Date().toISOString();
      const next: VehicleRecord = {
        ...current,
        ...input,
        fuelQuantity: corrected ? round1((input.tankCapacity * input.fuelLevelPercent) / 100) : Math.min(current.fuelQuantity, input.tankCapacity),
        fuelAsOf: corrected ? now : current.fuelAsOf,
        updatedAt: now,
      };
      p.vehicles = p.vehicles.map((v) => (v.id === id ? next : v));
    });
    return { ok: true };
  });

  app.delete("/api/profile/vehicles/:id", async (request) => {
    const { id } = request.params as { id: string };
    const p = profileOf(store.getState());
    findVehicle(p, id);
    const refs = p.fuelFills.filter((f) => f.vehicleId === id).map((f) => f.file);
    change("VEHICLE_REMOVED", id, (profile) => {
      profile.vehicles = profile.vehicles.filter((v) => v.id !== id);
      profile.fuelFills = profile.fuelFills.filter((f) => f.vehicleId !== id);
      profile.trips = profile.trips.filter((t) => t.vehicleId !== id);
      profile.serviceRecords = profile.serviceRecords.filter((s) => s.vehicleId !== id);
    });
    for (const ref of refs) await dropFile(ref);
    return { ok: true };
  });

  // A fuel bill: moves the fuel estimate and feeds the real-mileage calculation.
  app.post("/api/profile/vehicles/:id/fuel", async (request) => {
    const { id } = request.params as { id: string };
    const upload = await readUpload(request);
    const input = parseData(FuelFillInputSchema, upload.fields);
    const vehicle = findVehicle(profileOf(store.getState()), id);
    if (input.quantity > vehicle.tankCapacity * 1.1) throw new HttpError(400, "That is more than the tank holds. Check the quantity.");
    return once(request, async () => {
      const fillId = newId("fill");
      const ref = upload.file ? await saveFile(upload.file) : undefined;
      change("FUEL_FILL_ADDED", fillId, (p, draft) => {
        const record = { ...input, id: fillId, vehicleId: id, createdAt: new Date().toISOString(), ...(ref ? { file: ref } : {}) };
        p.fuelFills.push(record);
        const current = findVehicle(p, id);
        const next = applyFill(current, input, new Date().toISOString());
        p.vehicles = p.vehicles.map((v) => (v.id === id ? next : v));
        note(draft, `Fuel added: ${current.name}`, `${input.quantity} for ₹${Math.round(input.amountInr).toLocaleString("en-IN")}`);
      });
      return { ok: true, id: fillId };
    });
  });

  app.post("/api/profile/vehicles/:id/services", async (request) => {
    const { id } = request.params as { id: string };
    const input = ServiceRecordInputSchema.parse(request.body ?? {});
    return once(request, () => {
      const recordId = newId("svc");
      change("SERVICE_LOGGED", recordId, (p, draft) => {
        const current = findVehicle(p, id);
        p.serviceRecords.push({ ...input, id: recordId, vehicleId: id, createdAt: new Date().toISOString() });
        const next: VehicleRecord = { ...current, updatedAt: new Date().toISOString() };
        if (input.odometerKm !== undefined && input.odometerKm > next.odometerKm) next.odometerKm = input.odometerKm;
        if (input.kind === "tyre") {
          next.tyreReplacedOn = input.date;
          next.tyreReplacedOdometerKm = input.odometerKm ?? next.odometerKm;
          next.tyreCondition = "good";
        }
        if (input.kind === "routine") {
          next.lastServiceOn = input.date;
          next.lastServiceOdometerKm = input.odometerKm ?? next.odometerKm;
        }
        p.vehicles = p.vehicles.map((v) => (v.id === id ? next : v));
        note(draft, `${input.kind === "tyre" ? "Tyres replaced" : "Service logged"}: ${current.name}`, input.note ?? input.date);
      });
      return { ok: true, id: recordId };
    });
  });

  // A trip: travelling in your own vehicle uses fuel at its mileage; other modes are just recorded.
  app.post("/api/profile/trips", async (request) => {
    const input = TripInputSchema.parse(request.body ?? {});
    return once(request, () => {
      const id = newId("trip");
      const result = change("TRIP_LOGGED", id, (p) => {
        p.trips.push({ ...input, id, createdAt: new Date().toISOString() });
        if (input.mode !== "own_vehicle" || !input.vehicleId) return null;
        const current = findVehicle(p, input.vehicleId);
        const next = applyTrip(current, p.fuelFills.filter((f) => f.vehicleId === current.id), input.distanceKm, new Date().toISOString());
        p.vehicles = p.vehicles.map((v) => (v.id === current.id ? next : v));
        return next;
      });
      if (!result) return { ok: true, id };
      const status = vehicleStatus({
        vehicle: result,
        fills: profileOf(store.getState()).fuelFills,
        services: profileOf(store.getState()).serviceRecords,
        today: todayIso(),
      });
      return { ok: true, id, fuelLeft: status.fuelLeft, unit: status.unit };
    });
  });

  // ── Bills ────────────────────────────────────────────────────────────────

  app.post("/api/profile/bills/electricity", async (request) => {
    const upload = await readUpload(request);
    const input = parseData(ElectricityBillInputSchema, upload.fields);
    return once(request, async () => {
      const id = newId("bill");
      const ref = upload.file ? await saveFile(upload.file) : undefined;
      change("BILL_ADDED", id, (p, draft) => {
        p.electricityBills.push({ ...input, id, createdAt: new Date().toISOString(), ...(ref ? { file: ref } : {}) });
        note(draft, "Electricity bill added", `₹${Math.round(input.amountInr).toLocaleString("en-IN")} due ${input.dueDate}`);
      });
      return { ok: true, id };
    });
  });

  app.patch("/api/profile/bills/electricity/:id", async (request) => {
    const { id } = request.params as { id: string };
    const { paid } = z.object({ paid: z.boolean() }).parse(request.body ?? {});
    change("BILL_MARKED", id, (p) => {
      const bill = p.electricityBills.find((b) => b.id === id);
      if (!bill) throw new HttpError(404, "Bill not found.");
      bill.paid = paid;
    });
    return { ok: true };
  });

  app.delete("/api/profile/bills/electricity/:id", async (request) => {
    const { id } = request.params as { id: string };
    const existing = profileOf(store.getState()).electricityBills.find((b) => b.id === id);
    if (!existing) throw new HttpError(404, "Bill not found.");
    change("BILL_REMOVED", id, (p) => {
      p.electricityBills = p.electricityBills.filter((b) => b.id !== id);
    });
    await dropFile(existing.file);
    return { ok: true };
  });

  app.get("/api/profile/bills/electricity/:id/file", async (request, reply) => {
    const { id } = request.params as { id: string };
    return sendFile(profileOf(store.getState()).electricityBills.find((b) => b.id === id)?.file, reply);
  });

  app.get("/api/profile/fuel/:id/file", async (request, reply) => {
    const { id } = request.params as { id: string };
    return sendFile(profileOf(store.getState()).fuelFills.find((f) => f.id === id)?.file, reply);
  });

  // Reads the printed figures off a bill photo so the form can be pre-filled. Nothing is saved until the user confirms.
  app.post("/api/profile/extract", async (request) => {
    const upload = await readUpload(request);
    const kind = z.enum(["fuel_bill", "electricity_bill"]).parse(upload.fields.kind);
    if (!upload.file) throw new HttpError(400, "Choose a photo of the bill.");
    if (!upload.file.mimeType.startsWith("image/")) {
      throw new HttpError(400, "Reading works with photos (JPG or PNG). For a PDF, type the details in.");
    }
    if (!process.env.OPENAI_API_KEY?.trim()) throw new HttpError(503, "Reading bills needs an OpenAI key on the server. Type the details in instead.");
    try {
      const fields = await extractBillWithVision({
        kind,
        imageDataUrl: `data:${upload.file.mimeType};base64,${upload.file.bytes.toString("base64")}`,
      });
      return { fields };
    } catch {
      throw new HttpError(422, "Couldn't read that bill. Try a clearer photo, or type the details in.");
    }
  });

  // ── Subscriptions (Netflix and other OTT, music, anything that renews) ───

  const toSubscription = (input: SubscriptionInput, id: string, existing?: SubscriptionRecord): SubscriptionRecord => {
    const catalogue = SUBSCRIPTION_CATALOG[input.provider];
    const record: SubscriptionRecord = {
      id,
      provider: input.provider,
      name: input.provider === "other" ? (input.name ?? "Subscription") : catalogue.label,
      amountInr: input.amountInr,
      cycle: input.cycle,
      nextDueOn: input.nextDueOn,
      payUrl: input.payUrl ?? catalogue.payUrl,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    if (input.plan) record.plan = input.plan;
    if (existing?.lastPaidOn) record.lastPaidOn = existing.lastPaidOn;
    return record;
  };

  app.post("/api/profile/subscriptions", async (request) => {
    const input = SubscriptionInputSchema.parse(request.body ?? {});
    return once(request, () => {
      const id = newId("sub");
      change("SUBSCRIPTION_ADDED", id, (p, draft) => {
        const record = toSubscription(input, id);
        p.subscriptions = [...(p.subscriptions ?? []), record];
        note(draft, `${record.name} added`, `₹${Math.round(record.amountInr).toLocaleString("en-IN")} ${record.cycle}, next due ${record.nextDueOn}`);
      });
      return { ok: true, id };
    });
  });

  app.put("/api/profile/subscriptions/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = SubscriptionInputSchema.parse(request.body ?? {});
    change("SUBSCRIPTION_UPDATED", id, (p) => {
      const existing = (p.subscriptions ?? []).find((sub) => sub.id === id);
      if (!existing) throw new HttpError(404, "Subscription not found.");
      p.subscriptions = (p.subscriptions ?? []).map((sub) => (sub.id === id ? toSubscription(input, id, existing) : sub));
    });
    return { ok: true };
  });

  // "I've paid": the payment itself happens on the provider's site, so this only moves the next due date forward one cycle.
  app.post("/api/profile/subscriptions/:id/paid", async (request) => {
    const { id } = request.params as { id: string };
    const result = change("SUBSCRIPTION_PAID", id, (p, draft) => {
      const existing = (p.subscriptions ?? []).find((sub) => sub.id === id);
      if (!existing) throw new HttpError(404, "Subscription not found.");
      const today = todayIso();
      let next = nextBillingDate(existing.nextDueOn, existing.cycle);
      // Paying late must not leave the next date already in the past.
      for (let i = 0; i < 36 && next < today; i += 1) next = nextBillingDate(next, existing.cycle);
      p.subscriptions = (p.subscriptions ?? []).map((sub) => (sub.id === id ? { ...sub, lastPaidOn: today, nextDueOn: next } : sub));
      note(draft, `${existing.name} paid`, `Next payment ${next}`);
      return { nextDueOn: next };
    });
    return { ok: true, ...result };
  });

  app.delete("/api/profile/subscriptions/:id", async (request) => {
    const { id } = request.params as { id: string };
    change("SUBSCRIPTION_REMOVED", id, (p) => {
      if (!(p.subscriptions ?? []).some((sub) => sub.id === id)) throw new HttpError(404, "Subscription not found.");
      p.subscriptions = (p.subscriptions ?? []).filter((sub) => sub.id !== id);
    });
    return { ok: true };
  });

  // ── Vendors ──────────────────────────────────────────────────────────────

  const toVendor = (input: VendorInput, id: string, householdIdValue: string): Vendor => {
    const vendor: Vendor = { id, householdId: householdIdValue, name: input.name, kind: input.kind, category: input.kind, categories: [input.kind], phoneE164: input.phone, isPreferred: input.isPreferred };
    if (input.location) vendor.location = input.location;
    if (input.notes) vendor.notes = input.notes;
    return vendor;
  };

  /** One preferred vendor per kind: choosing a new favourite clears the old one. */
  const settlePreferred = (draft: CanonicalStateData, vendor: Vendor) => {
    if (!vendor.isPreferred) return;
    for (const other of draft.vendors) if (other.id !== vendor.id && other.kind === vendor.kind) other.isPreferred = false;
  };

  app.post("/api/profile/vendors", async (request) => {
    const input = VendorInputSchema.parse(request.body ?? {});
    return once(request, () => {
      const id = newId("vnd");
      change("VENDOR_ADDED", id, (_p, draft) => {
        const vendor = toVendor(input, id, draft.households[0]?.id ?? "hh_demo_001");
        draft.vendors.push(vendor);
        settlePreferred(draft, vendor);
      });
      return { ok: true, id };
    });
  });

  app.put("/api/profile/vendors/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = VendorInputSchema.parse(request.body ?? {});
    change("VENDOR_UPDATED", id, (_p, draft) => {
      const existing = draft.vendors.find((v) => v.id === id);
      if (!existing) throw new HttpError(404, "Vendor not found.");
      const next = { ...existing, ...toVendor(input, id, existing.householdId) };
      if (!input.location) delete next.location;
      if (!input.notes) delete next.notes;
      draft.vendors = draft.vendors.map((v) => (v.id === id ? next : v));
      settlePreferred(draft, next);
    });
    return { ok: true };
  });

  app.delete("/api/profile/vendors/:id", async (request) => {
    const { id } = request.params as { id: string };
    change("VENDOR_REMOVED", id, (_p, draft) => {
      if (!draft.vendors.some((v) => v.id === id)) throw new HttpError(404, "Vendor not found.");
      draft.vendors = draft.vendors.filter((v) => v.id !== id);
    });
    return { ok: true };
  });

  return { buildView };
}
