// Client for the Setup API (/api/profile). Setup data lives on the server for the
// signed-in household, so unlike the rest of the app there is no offline copy.
import type {
  DocumentInput,
  ElectricityBillInput,
  FamilyMemberInput,
  FuelFillInput,
  ServiceRecordInput,
  SetupStepId,
  TripInput,
  VehicleInput,
  VendorInput,
} from "@household/contracts";
import type { ProfileView } from "@household/life";
import { API_BASE } from "./api";
import { authHeaders } from "./auth";

export type { ProfileView };

export class ProfileApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Body = { json: unknown } | { form: FormData } | undefined;

async function send<T>(path: string, method: string, body?: Body, key?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/profile${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(await authHeaders()),
        ...(body && "json" in body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: "json" in body ? JSON.stringify(body.json) : body.form } : {}),
    });
  } catch {
    throw new ProfileApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    if (res.ok) return undefined as T;
    throw new ProfileApiError(res.status, `The server returned an error (HTTP ${res.status}). Try again in a moment.`);
  }
  const data = (await res.json()) as T & { error?: string; issues?: Array<{ path: string; message: string }> };
  if (!res.ok) {
    const detail = data.issues?.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join(". ");
    throw new ProfileApiError(res.status, detail || data.error || `Request failed (${res.status})`);
  }
  return data;
}

const json = (value: unknown): Body => ({ json: value });

function upload(data: unknown, file?: File, extra: Record<string, string> = {}): Body {
  const form = new FormData();
  form.append("data", JSON.stringify(data));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  if (file) form.append("file", file, file.name);
  return { form };
}

/** A fresh key for each submit, so a double tap or a retry cannot add the same record twice. */
export const newKey = () => crypto.randomUUID();

export const getProfile = () => send<ProfileView>("", "GET");
export const startSetup = () => send<{ ok: true }>("/start", "POST", json({}));
export const skipStep = (step: Exclude<SetupStepId, "family">, skipped: boolean) => send<{ ok: true }>("/skip", "POST", json({ step, skipped }));

// Family
type FamilyBody = Omit<FamilyMemberInput, "phone"> & { phone?: string | undefined };
export const updateMe = (input: FamilyBody) => send<{ ok: true }>("/me", "PUT", json(input));
export const addFamily = (input: FamilyBody, key: string) => send<{ ok: true; id: string }>("/family", "POST", json(input), key);
export const updateFamily = (id: string, input: FamilyBody) => send<{ ok: true }>(`/family/${id}`, "PUT", json(input));
export const removeFamily = (id: string) => send<{ ok: true }>(`/family/${id}`, "DELETE");

// Documents
export const addDocument = (input: DocumentInput, file: File | undefined, key: string) =>
  send<{ ok: true; id: string }>("/documents", "POST", upload(input, file), key);
export const updateDocument = (id: string, input: DocumentInput, file?: File) => send<{ ok: true }>(`/documents/${id}`, "PUT", upload(input, file));
export const removeDocument = (id: string) => send<{ ok: true }>(`/documents/${id}`, "DELETE");

/** Opens a stored file in a new tab. The request carries the session, so it cannot be a plain link. */
export async function openStoredFile(path: string): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const res = await fetch(`${API_BASE}/profile${path}`, { headers: await authHeaders() });
    if (!res.ok) throw new ProfileApiError(res.status, "The file could not be opened.");
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

// Vehicles
export const addVehicle = (input: VehicleInput, key: string) => send<{ ok: true; id: string }>("/vehicles", "POST", json(input), key);
export const updateVehicle = (id: string, input: VehicleInput) => send<{ ok: true }>(`/vehicles/${id}`, "PUT", json(input));
export const removeVehicle = (id: string) => send<{ ok: true }>(`/vehicles/${id}`, "DELETE");
export const addFuel = (vehicleId: string, input: FuelFillInput, file: File | undefined, key: string) =>
  send<{ ok: true; id: string }>(`/vehicles/${vehicleId}/fuel`, "POST", upload(input, file), key);
export const addService = (vehicleId: string, input: ServiceRecordInput, key: string) =>
  send<{ ok: true; id: string }>(`/vehicles/${vehicleId}/services`, "POST", json(input), key);
export const addTrip = (input: TripInput, key: string) =>
  send<{ ok: true; id: string; fuelLeft?: { quantity: number; rangeKm: number; percent: number }; unit?: { quantity: string } }>("/trips", "POST", json(input), key);

// Bills
export const addElectricityBill = (input: ElectricityBillInput, file: File | undefined, key: string) =>
  send<{ ok: true; id: string }>("/bills/electricity", "POST", upload(input, file), key);
export const markBillPaid = (id: string, paid: boolean) => send<{ ok: true }>(`/bills/electricity/${id}`, "PATCH", json({ paid }));
export const removeBill = (id: string) => send<{ ok: true }>(`/bills/electricity/${id}`, "DELETE");

export interface ReadBill {
  date?: string;
  quantity?: number;
  amountInr?: number;
  odometerKm?: number;
  dueDate?: string;
  units?: number;
  billingPeriod?: string;
  consumerNo?: string;
}
export const readBill = (kind: "fuel_bill" | "electricity_bill", file: File) => {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", file, file.name);
  return send<{ fields: ReadBill }>("/extract", "POST", { form });
};

// Vendors
type VendorBody = Omit<VendorInput, "phone"> & { phone: string };
export const addVendor = (input: VendorBody, key: string) => send<{ ok: true; id: string }>("/vendors", "POST", json(input), key);
export const updateVendor = (id: string, input: VendorBody) => send<{ ok: true }>(`/vendors/${id}`, "PUT", json(input));
export const removeVendor = (id: string) => send<{ ok: true }>(`/vendors/${id}`, "DELETE");
