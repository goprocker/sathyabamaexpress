import { useState, type FormEvent } from "react";
import { Car, ChevronDown, Fuel, Lightbulb, Pencil, Plus, Route, Trash2, Wrench } from "lucide-react";
import {
  FUEL_UNITS,
  FuelFillInputSchema,
  SERVICE_KINDS,
  ServiceRecordInputSchema,
  TRAVEL_MODES,
  TYRE_CONDITIONS,
  TripInputSchema,
  VEHICLE_FUELS,
  VEHICLE_KINDS,
  VehicleInputSchema,
  type ServiceKind,
  type TravelMode,
  type TyreCondition,
  type VehicleFuel,
  type VehicleKind,
} from "@household/contracts";
import { Button, StatusPill, type PillTone } from "@/components/ui/primitives";
import { useSetupAction } from "@/hooks/profile";
import type { PreparedFile } from "@/lib/image";
import * as api from "@/lib/profileApi";
import type { ProfileView } from "@/lib/profileApi";
import { CheckField, FileField, FormButtons, FormCard, Notice, SelectField, TextField, errorMessage, grid2, num, today, validate } from "./kit";

type Entry = ProfileView["vehicles"][number];

const KIND_LABEL: Record<VehicleKind, string> = { car: "Car", bike: "Motorbike", scooter: "Scooter", auto: "Auto", other: "Other" };
const FUEL_LABEL: Record<VehicleFuel, string> = { petrol: "Petrol", diesel: "Diesel", cng: "CNG", electric: "Electric", hybrid: "Hybrid" };
const CONDITION_LABEL: Record<TyreCondition, string> = { unknown: "Not sure", good: "Good", worn: "Getting worn", replace_soon: "Needs replacing soon" };
const MODE_LABEL: Record<TravelMode, string> = { own_vehicle: "This vehicle", metro: "Metro", bus: "Bus", cab: "Cab or auto", walk: "Walk", other: "Other" };
const SERVICE_LABEL: Record<ServiceKind, string> = {
  routine: "Regular service",
  tyre: "I replaced the tyres",
  battery: "Battery",
  brakes: "Brakes",
  repair: "Repair",
  other: "Other",
};

const int = (n: number) => Math.round(n).toLocaleString("en-IN");
const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((value) => ({ value, label: labels[value] }));

const stateTone = (state: string): PillTone =>
  state === "overdue" || state === "replace" || state === "dropped" ? "danger" : state === "due_soon" || state === "check" ? "warning" : state === "ok" || state === "better" ? "accent" : "muted";

// ── Add / edit a vehicle ───────────────────────────────────────────────────

function VehicleForm({ entry, onDone }: { entry?: Entry | undefined; onDone: () => void }) {
  const v = entry?.vehicle;
  const str = (n: number | undefined) => (n === undefined ? "" : String(n));
  const [name, setName] = useState(v?.name ?? "");
  const [kind, setKind] = useState<VehicleKind>(v?.kind ?? "car");
  const [fuel, setFuel] = useState<VehicleFuel>(v?.fuel ?? "petrol");
  const [registrationNo, setRegistrationNo] = useState(v?.registrationNo ?? "");
  const [year, setYear] = useState(str(v?.year));
  const [odometerKm, setOdometerKm] = useState(str(v ? Math.round(v.odometerKm) : undefined));
  const [mileage, setMileage] = useState(str(v?.mileage));
  const [tankCapacity, setTankCapacity] = useState(str(v?.tankCapacity));
  const [fuelLevel, setFuelLevel] = useState(entry ? String(entry.status.fuelLeft.percent) : "100");
  const [dailyKm, setDailyKm] = useState(str(v?.dailyKm));
  const [serviceKm, setServiceKm] = useState(str(v?.serviceIntervalKm));
  const [serviceMonths, setServiceMonths] = useState(str(v?.serviceIntervalMonths));
  const [lastServiceOn, setLastServiceOn] = useState(v?.lastServiceOn ?? "");
  const [lastServiceOdo, setLastServiceOdo] = useState(str(v?.lastServiceOdometerKm));
  const [tyreCondition, setTyreCondition] = useState<TyreCondition>(v?.tyreCondition ?? "unknown");
  const [tyreOn, setTyreOn] = useState(v?.tyreReplacedOn ?? "");
  const [tyreOdo, setTyreOdo] = useState(str(v?.tyreReplacedOdometerKm));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const unit = FUEL_UNITS[fuel];

  const save = useSetupAction(async (input: Parameters<typeof api.addVehicle>[0]) => (entry ? api.updateVehicle(entry.vehicle.id, input) : api.addVehicle(input, api.newKey())));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const parsed = validate(VehicleInputSchema, {
      name,
      kind,
      fuel,
      registrationNo,
      year: num(year),
      odometerKm: num(odometerKm),
      mileage: num(mileage),
      tankCapacity: num(tankCapacity),
      fuelLevelPercent: num(fuelLevel) ?? 100,
      dailyKm: num(dailyKm),
      serviceIntervalKm: num(serviceKm),
      serviceIntervalMonths: num(serviceMonths),
      lastServiceOn,
      lastServiceOdometerKm: num(lastServiceOdo),
      tyreCondition,
      tyreReplacedOn: tyreOn,
      tyreReplacedOdometerKm: num(tyreOdo),
    });
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    save.mutate(parsed.data, { onSuccess: onDone, onError: (err) => setFailure(errorMessage(err)) });
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset className="space-y-4">
        <legend className="eyebrow mb-3">The vehicle</legend>
        <TextField label="Name" value={name} onChange={setName} error={errors.name} placeholder="For example: Honda City" />
        <div className={grid2}>
          <SelectField label="Type" value={kind} onChange={setKind} options={opts(VEHICLE_KINDS, KIND_LABEL)} />
          <SelectField label="Fuel" value={fuel} onChange={setFuel} options={opts(VEHICLE_FUELS, FUEL_LABEL)} />
        </div>
        <div className={grid2}>
          <TextField label="Registration number (optional)" value={registrationNo} onChange={setRegistrationNo} placeholder="TN 01 AB 1234" />
          <TextField label="Year (optional)" value={year} onChange={setYear} type="number" inputMode="numeric" error={errors.year} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-3">Mileage and fuel</legend>
        <div className={grid2}>
          <TextField label={`Estimated mileage (${unit.mileage})`} value={mileage} onChange={setMileage} type="number" error={errors.mileage} hint="What it usually gives, or the maker's figure." />
          <TextField label={`Tank size (${unit.quantityLong})`} value={tankCapacity} onChange={setTankCapacity} type="number" error={errors.tankCapacity} />
        </div>
        <div className={grid2}>
          <TextField label="Odometer now (km)" value={odometerKm} onChange={setOdometerKm} type="number" inputMode="numeric" error={errors.odometerKm} />
          <TextField label={`Fuel in the tank now (%)`} value={fuelLevel} onChange={setFuelLevel} type="number" min={0} max={100} error={errors.fuelLevelPercent} hint="A rough guess is fine. Trips and fuel bills keep it updated." />
        </div>
        <TextField label="Usual distance per day (km, optional)" value={dailyKm} onChange={setDailyKm} type="number" error={errors.dailyKm} hint="Lets us say when you will need to refuel." />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-3">Service</legend>
        <div className={grid2}>
          <TextField label="Last service on" value={lastServiceOn} onChange={setLastServiceOn} type="date" error={errors.lastServiceOn} />
          <TextField label="Odometer at that service (km)" value={lastServiceOdo} onChange={setLastServiceOdo} type="number" inputMode="numeric" error={errors.lastServiceOdometerKm} />
        </div>
        <div className={grid2}>
          <TextField label="Service every (km)" value={serviceKm} onChange={setServiceKm} type="number" inputMode="numeric" error={errors.serviceIntervalKm} hint="Leave empty to use a typical interval for this vehicle." />
          <TextField label="Or every (months)" value={serviceMonths} onChange={setServiceMonths} type="number" inputMode="numeric" error={errors.serviceIntervalMonths} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="eyebrow mb-3">Tyres</legend>
        <SelectField label="Condition" value={tyreCondition} onChange={setTyreCondition} options={opts(TYRE_CONDITIONS, CONDITION_LABEL)} />
        <div className={grid2}>
          <TextField label="Last replaced on" value={tyreOn} onChange={setTyreOn} type="date" error={errors.tyreReplacedOn} />
          <TextField label="Odometer when replaced (km)" value={tyreOdo} onChange={setTyreOdo} type="number" inputMode="numeric" error={errors.tyreReplacedOdometerKm} />
        </div>
      </fieldset>

      {failure && <Notice tone="error">{failure}</Notice>}
      <FormButtons busy={save.isPending} submitLabel={entry ? "Save changes" : "Add vehicle"} onCancel={onDone} />
    </form>
  );
}

// ── Log a trip, a fuel bill, a service ─────────────────────────────────────

function TripForm({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const [mode, setMode] = useState<TravelMode>("own_vehicle");
  const [distance, setDistance] = useState("");
  const [date, setDate] = useState(today());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const save = useSetupAction(async (input: Parameters<typeof api.addTrip>[0]) => api.addTrip(input, api.newKey()));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const parsed = validate(TripInputSchema, { date, mode, vehicleId: mode === "own_vehicle" ? entry.vehicle.id : undefined, distanceKm: num(distance) });
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: (res) => {
        setDistance("");
        setResult(res.fuelLeft ? `Fuel left is now about ${res.fuelLeft.quantity} ${res.unit?.quantity ?? ""}, enough for roughly ${int(res.fuelLeft.rangeKm)} km.` : "Trip saved. No fuel used from this vehicle.");
      },
      onError: (err) => setFailure(errorMessage(err)),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-[14px] text-text-secondary">Driving this vehicle uses fuel at its mileage. Other ways of travelling are noted but use none.</p>
      <div className={grid2}>
        <SelectField label="How did you travel" value={mode} onChange={setMode} options={opts(TRAVEL_MODES, MODE_LABEL)} />
        <TextField label="Distance (km)" value={distance} onChange={setDistance} type="number" error={errors.distanceKm} />
      </div>
      <TextField label="Date" value={date} onChange={setDate} type="date" error={errors.date} />
      {result && <Notice tone="success">{result}</Notice>}
      {failure && <Notice tone="error">{failure}</Notice>}
      <FormButtons busy={save.isPending} submitLabel="Save trip" onCancel={onDone} />
    </form>
  );
}

function FuelForm({ entry, uploadsEnabled, onDone }: { entry: Entry; uploadsEnabled: boolean; onDone: () => void }) {
  const unit = FUEL_UNITS[entry.vehicle.fuel];
  const [date, setDate] = useState(today());
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [odometer, setOdometer] = useState("");
  const [fullTank, setFullTank] = useState(true);
  const [file, setFile] = useState<PreparedFile | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);
  const [reading, setReading] = useState(false);
  const save = useSetupAction(async (args: { input: Parameters<typeof api.addFuel>[1]; file: File | undefined }) => api.addFuel(entry.vehicle.id, args.input, args.file, api.newKey()));

  const readIt = async () => {
    if (!file || !file.previewUrl) return;
    setReading(true);
    setFailure(null);
    try {
      const { fields } = await api.readBill("fuel_bill", file.file);
      if (fields.date) setDate(fields.date);
      if (fields.quantity) setQuantity(String(fields.quantity));
      if (fields.amountInr) setAmount(String(fields.amountInr));
      if (fields.odometerKm) setOdometer(String(fields.odometerKm));
      setFilled(Object.keys(fields).length > 0);
      if (Object.keys(fields).length === 0) setFailure("Couldn't find figures on that bill. Type them in instead.");
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setReading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const parsed = validate(FuelFillInputSchema, { date, quantity: num(quantity), amountInr: num(amount), odometerKm: num(odometer), fullTank });
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    save.mutate({ input: parsed.data, file: file?.file }, { onSuccess: onDone, onError: (err) => setFailure(errorMessage(err)) });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FileField label="Photo of the bill (optional)" prepared={file} onChange={(f) => { setFile(f); setFilled(false); }} disabled={!uploadsEnabled} disabledReason="Sign in to keep the bill photo. You can still type the details in." />
      {file?.previewUrl && (
        <Button type="button" variant="secondary" size="sm" onClick={() => void readIt()} disabled={reading}>
          {reading ? "Reading…" : "Read the bill for me"}
        </Button>
      )}
      {filled && <Notice tone="info">Filled in from your bill. Please check the numbers before saving.</Notice>}
      <div className={grid2}>
        <TextField label="Date" value={date} onChange={setDate} type="date" error={errors.date} />
        <TextField label={`Filled (${unit.quantityLong})`} value={quantity} onChange={setQuantity} type="number" error={errors.quantity} />
      </div>
      <div className={grid2}>
        <TextField label="Amount paid (₹)" value={amount} onChange={setAmount} type="number" error={errors.amountInr} />
        <TextField label="Odometer (km, optional)" value={odometer} onChange={setOdometer} type="number" inputMode="numeric" error={errors.odometerKm} hint="Add it to work out your real mileage." />
      </div>
      <CheckField label="I filled it to the brim" checked={fullTank} onChange={setFullTank} hint="Two brim-full fills in a row give a reliable mileage." />
      {failure && <Notice tone="error">{failure}</Notice>}
      <FormButtons busy={save.isPending} submitLabel="Save fuel bill" onCancel={onDone} />
    </form>
  );
}

function ServiceForm({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const [kind, setKind] = useState<ServiceKind>("routine");
  const [date, setDate] = useState(today());
  const [odometer, setOdometer] = useState(String(entry.status.odometerKm));
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const save = useSetupAction(async (input: Parameters<typeof api.addService>[1]) => api.addService(entry.vehicle.id, input, api.newKey()));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const parsed = validate(ServiceRecordInputSchema, { date, kind, odometerKm: num(odometer), costInr: num(cost), note });
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    save.mutate(parsed.data, { onSuccess: onDone, onError: (err) => setFailure(errorMessage(err)) });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <SelectField label="What was done" value={kind} onChange={setKind} options={opts(SERVICE_KINDS, SERVICE_LABEL)} hint={kind === "tyre" ? "Marks the tyres as new and restarts their reminders." : kind === "routine" ? "Restarts the service reminder." : undefined} />
      <div className={grid2}>
        <TextField label="Date" value={date} onChange={setDate} type="date" error={errors.date} />
        <TextField label="Odometer (km)" value={odometer} onChange={setOdometer} type="number" inputMode="numeric" error={errors.odometerKm} />
      </div>
      <div className={grid2}>
        <TextField label="Cost (₹, optional)" value={cost} onChange={setCost} type="number" error={errors.costInr} />
        <TextField label="Note (optional)" value={note} onChange={setNote} error={errors.note} />
      </div>
      {failure && <Notice tone="error">{failure}</Notice>}
      <FormButtons busy={save.isPending} submitLabel="Save" onCancel={onDone} />
    </form>
  );
}

// ── A vehicle ──────────────────────────────────────────────────────────────

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-[12px] bg-surface-subtle p-3">
      <p className="mono-label mb-1">{label}</p>
      {children}
    </div>
  );
}

type Panel = "trip" | "fuel" | "service" | "edit" | null;

function VehicleCard({ entry, uploadsEnabled }: { entry: Entry; uploadsEnabled: boolean }) {
  const { vehicle, status } = entry;
  const [panel, setPanel] = useState<Panel>(null);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const remove = useSetupAction(api.removeVehicle);
  const done = () => setPanel(null);
  const { fuelLeft, mileage, service, tyre } = status;
  const barTone = fuelLeft.low ? "bg-danger" : fuelLeft.percent <= 30 ? "bg-warning" : "bg-accent";

  const action = (id: Exclude<Panel, null>, label: string, Icon: typeof Route) => (
    <Button size="sm" variant={panel === id ? "primary" : "secondary"} onClick={() => setPanel(panel === id ? null : id)} aria-pressed={panel === id}>
      <Icon size={14} strokeWidth={1.75} /> {label}
    </Button>
  );

  return (
    <li className="card-base space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
          <Car size={20} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[18px] font-semibold tracking-[-0.02em]">{vehicle.name}</h3>
          <p className="truncate text-[13px] text-text-secondary">
            {[KIND_LABEL[vehicle.kind], FUEL_LABEL[vehicle.fuel], vehicle.registrationNo, `${int(status.odometerKm)} km`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label={vehicle.fuel === "electric" ? "Charge" : "Fuel"}>
          <p className="text-[20px] font-semibold tracking-[-0.02em]">
            {fuelLeft.quantity} <span className="text-[13px] font-normal text-text-secondary">{status.unit.quantity}</span>
          </p>
          <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-border" role="img" aria-label={`${fuelLeft.percent}% full`}>
            <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, fuelLeft.percent)}%` }} />
          </div>
          <p className="text-[12px] text-text-secondary">About {int(fuelLeft.rangeKm)} km{fuelLeft.refuelBy ? ` · ${vehicle.fuel === "electric" ? "charge" : "refuel"} by ${fuelLeft.refuelBy}` : ""}</p>
        </Stat>
        <Stat label="Mileage">
          <p className="text-[20px] font-semibold tracking-[-0.02em]">
            {mileage.actual ?? mileage.rated} <span className="text-[13px] font-normal text-text-secondary">{status.unit.mileage}</span>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-secondary">
            {mileage.actual === null ? "Rated. Add fuel bills for your real figure." : `Rated ${mileage.rated}`}
            {mileage.state === "dropped" && <StatusPill tone="danger">{mileage.dropPct}% lower</StatusPill>}
            {mileage.state === "better" && <StatusPill tone="accent">Better than rated</StatusPill>}
          </p>
        </Stat>
        <Stat label="Service">
          <StatusPill tone={stateTone(service.state)}>{{ unknown: "Not set", ok: "On track", due_soon: "Due soon", overdue: "Overdue" }[service.state]}</StatusPill>
          <p className="mt-1.5 text-[12px] text-text-secondary">{service.detail}</p>
        </Stat>
        <Stat label="Tyres">
          <StatusPill tone={stateTone(tyre.state)}>{{ unknown: "Not set", ok: "Good", check: "Check them", replace: "Replace" }[tyre.state]}</StatusPill>
          <p className="mt-1.5 text-[12px] text-text-secondary">{tyre.detail}</p>
        </Stat>
      </div>

      {status.suggestions.length > 0 && (
        <ul className="space-y-2" aria-label="Suggestions">
          {status.suggestions.map((s) => (
            <li key={s} className="flex items-start gap-2.5 text-[14px] text-text-secondary">
              <Lightbulb size={16} strokeWidth={1.6} className="mt-0.5 shrink-0 text-warning" />
              {s}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {action("trip", "Log a trip", Route)}
        {action("fuel", vehicle.fuel === "electric" ? "Add charging bill" : "Add fuel bill", Fuel)}
        {action("service", "Log service", Wrench)}
        {action("edit", "Edit", Pencil)}
      </div>

      {panel && (
        <FormCard title={{ trip: "Log a trip", fuel: vehicle.fuel === "electric" ? "Add a charging bill" : "Add a fuel bill", service: "Log a service", edit: `Edit ${vehicle.name}` }[panel]} onClose={done}>
          {panel === "trip" && <TripForm entry={entry} onDone={done} />}
          {panel === "fuel" && <FuelForm entry={entry} uploadsEnabled={uploadsEnabled} onDone={done} />}
          {panel === "service" && <ServiceForm entry={entry} onDone={done} />}
          {panel === "edit" && <VehicleForm entry={entry} onDone={done} />}
        </FormCard>
      )}

      {(entry.recentFills.length > 0 || entry.recentServices.length > 0) && (
        <details className="group rounded-[12px] border border-border">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between px-4 text-[14px] font-medium">
            History
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
          </summary>
          <ul className="divide-y divide-border border-t border-border px-4 text-[13px]">
            {entry.recentFills.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span>
                  {f.date} · {f.quantity} {status.unit.quantity} · ₹{int(f.amountInr)}
                  {f.odometerKm !== undefined ? ` · ${int(f.odometerKm)} km` : ""}
                </span>
                {f.file && (
                  <button type="button" className="text-accent underline" onClick={() => void api.openStoredFile(`/fuel/${f.id}/file`).catch((e) => setFailure(errorMessage(e)))}>
                    View bill
                  </button>
                )}
              </li>
            ))}
            {entry.recentServices.map((s) => (
              <li key={s.id} className="py-2.5">
                {s.date} · {SERVICE_LABEL[s.kind]}
                {s.odometerKm !== undefined ? ` · ${int(s.odometerKm)} km` : ""}
                {s.costInr !== undefined ? ` · ₹${int(s.costInr)}` : ""}
                {s.note ? ` · ${s.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      {failure && <Notice tone="error">{failure}</Notice>}

      <div className="flex justify-end">
        {confirming ? (
          <span className="flex items-center gap-1">
            <span className="text-[13px] text-text-secondary">Remove it and its history?</span>
            <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(vehicle.id, { onError: (err) => setFailure(errorMessage(err)) })}>
              Yes, remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirming(true)}>
            <Trash2 size={14} /> Remove vehicle
          </Button>
        )}
      </div>
    </li>
  );
}

export function VehiclesTab({ profile }: { profile: ProfileView }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-text-secondary">
        Add each vehicle with its estimated mileage. Log trips and petrol bills and we work out how much fuel is left, remind you to refuel, spot mileage drops, and keep track of service and tyres.
      </p>

      {profile.vehicles.length > 0 && (
        <ul className="space-y-4">
          {profile.vehicles.map((entry) => (
            <VehicleCard key={entry.vehicle.id} entry={entry} uploadsEnabled={profile.uploadsEnabled} />
          ))}
        </ul>
      )}

      {adding ? (
        <FormCard title="Add a vehicle" onClose={() => setAdding(false)}>
          <VehicleForm onDone={() => setAdding(false)} />
        </FormCard>
      ) : (
        <>
          {profile.vehicles.length === 0 && (
            <div className="card-base flex items-center gap-4 p-5">
              <Car size={22} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
              <p className="text-[14px] text-text-secondary">No vehicles yet. Add the car, bike or scooter you use at home.</p>
            </div>
          )}
          <Button variant="primary" onClick={() => setAdding(true)} className="w-full sm:w-auto">
            <Plus size={16} strokeWidth={1.75} />
            Add a vehicle
          </Button>
        </>
      )}
    </div>
  );
}
