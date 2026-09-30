import { useState, type FormEvent } from "react";
import { MapPin, Pencil, Phone, Plus, Star, Store, Trash2 } from "lucide-react";
import { VENDOR_KINDS, VENDOR_LABELS, VendorInputSchema, type VendorKind } from "@household/contracts";
import { Button, StatusPill } from "@/components/ui/primitives";
import { useSetupAction } from "@/hooks/profile";
import * as api from "@/lib/profileApi";
import type { ProfileView } from "@/lib/profileApi";
import { CheckField, FormButtons, FormCard, Notice, SelectField, TextField, errorMessage, grid2, validate } from "./kit";

type VendorRecord = ProfileView["vendors"][number];

const QUICK_KINDS: VendorKind[] = ["milk", "grocery", "poultry", "vegetables", "gas", "water"];

const formatPhone = (e164: string) => (/^\+91\d{10}$/.test(e164) ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : e164);
const kindOf = (v: VendorRecord): VendorKind => ((VENDOR_KINDS as readonly string[]).includes(v.kind ?? "") ? (v.kind as VendorKind) : "other");

function VendorForm({ vendor, kind: initialKind, onDone }: { vendor?: VendorRecord | undefined; kind?: VendorKind | undefined; onDone: () => void }) {
  const [kind, setKind] = useState<VendorKind>(vendor ? kindOf(vendor) : (initialKind ?? "milk"));
  const [name, setName] = useState(vendor?.name ?? "");
  const [phone, setPhone] = useState(vendor?.phoneE164 ?? "");
  const [location, setLocation] = useState(vendor?.location ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [isPreferred, setIsPreferred] = useState(vendor?.isPreferred ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const save = useSetupAction(async (input: Parameters<typeof api.addVendor>[0]) => (vendor ? api.updateVendor(vendor.id, input) : api.addVendor(input, api.newKey())));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const parsed = validate(VendorInputSchema, { name, kind, phone, location, notes, isPreferred });
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    save.mutate(parsed.data, { onSuccess: onDone, onError: (err) => setFailure(errorMessage(err)) });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <SelectField label="What do they supply" value={kind} onChange={setKind} options={VENDOR_KINDS.map((value) => ({ value, label: VENDOR_LABELS[value] }))} />
      <div className={grid2}>
        <TextField label="Name" value={name} onChange={setName} error={errors.name} placeholder="For example: Murugan Chicken" />
        <TextField label="Mobile number" value={phone} onChange={setPhone} type="tel" inputMode="tel" error={errors.phone} autoComplete="off" />
      </div>
      <TextField label="Where are they (optional)" value={location} onChange={setLocation} placeholder="Shop name, street or area" error={errors.location} />
      <TextField label="Notes (optional)" value={notes} onChange={setNotes} placeholder="Delivers before 7 am, Sundays off" error={errors.notes} />
      <CheckField label="My usual choice for this" checked={isPreferred} onChange={setIsPreferred} hint="Orders and reminders go to your usual choice first." />
      {failure && <Notice tone="error">{failure}</Notice>}
      <FormButtons busy={save.isPending} submitLabel={vendor ? "Save changes" : "Add vendor"} onCancel={onDone} />
    </form>
  );
}

function VendorRow({ vendor, onEdit }: { vendor: VendorRecord; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const remove = useSetupAction(api.removeVendor);

  return (
    <li className="card-base space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
          <Store size={18} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[16px] font-medium">
            <span className="truncate">{vendor.name}</span>
            {vendor.isPreferred && (
              <StatusPill tone="accent">
                <Star size={11} fill="currentColor" /> Usual
              </StatusPill>
            )}
          </p>
          <p className="text-[13px] text-text-secondary">{VENDOR_LABELS[kindOf(vendor)]}</p>
          {vendor.location && (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-text-secondary">
              <MapPin size={13} className="shrink-0" /> <span className="truncate">{vendor.location}</span>
            </p>
          )}
          {vendor.notes && <p className="mt-1 text-[13px] text-text-tertiary">{vendor.notes}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <a href={`tel:${vendor.phoneE164}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-small text-accent-text hover:bg-accent-hover">
          <Phone size={14} /> {formatPhone(vendor.phoneE164)}
        </a>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil size={14} /> Edit
        </Button>
        {confirming ? (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(vendor.id, { onError: (err) => setFailure(errorMessage(err)) })}>
              Yes, delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirming(true)}>
            <Trash2 size={14} /> Delete
          </Button>
        )}
      </div>
      {failure && <Notice tone="error">{failure}</Notice>}
    </li>
  );
}

export function VendorsTab({ profile }: { profile: ProfileView }) {
  const [form, setForm] = useState<{ vendor?: VendorRecord; kind?: VendorKind } | null>(null);

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-text-secondary">
        Save the people you order from: the milk delivery, grocery shop, poultry and vegetable sellers. When you run short of something, we know who to contact and how.
      </p>

      {form && !form.vendor ? (
        <FormCard title="Add a vendor" onClose={() => setForm(null)}>
          <VendorForm kind={form.kind} onDone={() => setForm(null)} />
        </FormCard>
      ) : (
        <div className="space-y-3">
          <Button variant="primary" onClick={() => setForm({})} className="w-full sm:w-auto">
            <Plus size={16} strokeWidth={1.75} />
            Add a vendor
          </Button>
          {profile.vendors.length === 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Quick add">
              {QUICK_KINDS.map((k) => (
                <button key={k} type="button" onClick={() => setForm({ kind: k })} className="glass min-h-[44px] rounded-full px-4 text-[14px] hover:bg-surface-elevated">
                  {VENDOR_LABELS[k].split(" (")[0]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {profile.vendors.length === 0 && !form && (
        <div className="card-base flex items-center gap-4 p-5">
          <Store size={22} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
          <p className="text-[14px] text-text-secondary">No vendors yet. Start with your milk or grocery supplier.</p>
        </div>
      )}

      {profile.vendors.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {profile.vendors.map((vendor) =>
            form?.vendor?.id === vendor.id ? (
              <li key={vendor.id} className="md:col-span-2">
                <FormCard title={`Edit ${vendor.name}`} onClose={() => setForm(null)}>
                  <VendorForm vendor={vendor} onDone={() => setForm(null)} />
                </FormCard>
              </li>
            ) : (
              <VendorRow key={vendor.id} vendor={vendor} onEdit={() => setForm({ vendor })} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}
