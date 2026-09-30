import { useState, type FormEvent } from "react";
import { Eye, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { DOCUMENT_LABELS, DOCUMENT_TYPES, DocumentInputSchema, type DocumentType } from "@household/contracts";
import { Button, StatusPill, type PillTone } from "@/components/ui/primitives";
import { useSetupAction } from "@/hooks/profile";
import type { PreparedFile } from "@/lib/image";
import * as api from "@/lib/profileApi";
import type { ProfileView } from "@/lib/profileApi";
import { FileField, FormButtons, FormCard, Notice, SelectField, TextField, errorMessage, grid2, validate } from "./kit";

type Doc = ProfileView["documents"][number];

const VEHICLE_DOCS: ReadonlySet<DocumentType> = new Set(["vehicle_rc", "insurance", "puc"]);
const HAS_EXPIRY: ReadonlySet<DocumentType> = new Set(["driving_licence", "passport", "vehicle_rc", "insurance", "puc", "other"]);

const NUMBER_LABEL: Record<DocumentType, string> = {
  aadhaar: "Aadhaar number",
  pan: "PAN",
  driving_licence: "Licence number",
  passport: "Passport number",
  voter_id: "Voter ID number",
  vehicle_rc: "Registration number",
  insurance: "Policy number",
  puc: "Certificate number",
  other: "Reference number",
};

const QUICK_ADD: DocumentType[] = ["aadhaar", "pan", "driving_licence", "insurance", "vehicle_rc", "passport"];

function expiryPill(doc: Doc): { tone: PillTone; text: string } | null {
  if (!doc.expiresOn || doc.daysToExpiry === null) return null;
  if (doc.daysToExpiry < 0) return { tone: "danger", text: "Expired" };
  if (doc.daysToExpiry <= 30) return { tone: "warning", text: doc.daysToExpiry === 0 ? "Expires today" : `Expires in ${doc.daysToExpiry} days` };
  return { tone: "muted", text: `Valid until ${doc.expiresOn}` };
}

function DocumentForm({ profile, doc, type: initialType, onDone }: { profile: ProfileView; doc?: Doc | undefined; type?: DocumentType | undefined; onDone: () => void }) {
  const [type, setType] = useState<DocumentType>(doc?.type ?? initialType ?? "aadhaar");
  const [label, setLabel] = useState(doc?.type === "other" ? (doc.label ?? "") : "");
  // Identity numbers are stored masked, so editing starts blank; other numbers are shown as saved.
  const isIdentityNumber = !VEHICLE_DOCS.has(type) && type !== "other";
  const [number, setNumber] = useState(doc && !doc.numberDisplay?.includes("•") ? (doc.numberDisplay ?? "") : "");
  const [holderId, setHolderId] = useState(doc?.holderId ?? profile.family[0]?.id ?? "");
  const [vehicleId, setVehicleId] = useState(doc?.vehicleId ?? profile.vehicles[0]?.vehicle.id ?? "");
  const [issuedOn, setIssuedOn] = useState(doc?.issuedOn ?? "");
  const [expiresOn, setExpiresOn] = useState(doc?.expiresOn ?? "");
  const [notes, setNotes] = useState(doc?.notes ?? "");
  const [file, setFile] = useState<PreparedFile | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const save = useSetupAction(async (args: { input: Parameters<typeof api.addDocument>[0]; file: File | undefined }) =>
    doc ? api.updateDocument(doc.id, args.input, args.file) : api.addDocument(args.input, args.file, api.newKey()),
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const parsed = validate(DocumentInputSchema, {
      type,
      label: type === "other" ? label : undefined,
      holderId: !VEHICLE_DOCS.has(type) && holderId ? holderId : undefined,
      vehicleId: VEHICLE_DOCS.has(type) && vehicleId ? vehicleId : undefined,
      number,
      issuedOn,
      expiresOn: HAS_EXPIRY.has(type) ? expiresOn : undefined,
      notes,
    });
    if (!parsed.ok) return setErrors(parsed.errors);
    if (type === "other" && !label.trim()) return setErrors({ label: "Give it a name" });
    setErrors({});
    save.mutate({ input: parsed.data, file: file?.file }, { onSuccess: onDone, onError: (err) => setFailure(errorMessage(err)) });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <SelectField label="Document" value={type} onChange={setType} options={DOCUMENT_TYPES.map((value) => ({ value, label: DOCUMENT_LABELS[value] }))} />
      {type === "other" && <TextField label="Name" value={label} onChange={setLabel} error={errors.label} placeholder="For example: Ration card" />}
      <div className={grid2}>
        <TextField
          label={NUMBER_LABEL[type]}
          value={number}
          onChange={setNumber}
          error={errors.number}
          hint={isIdentityNumber ? "Only the last 4 characters are kept. Your file is the full record." : undefined}
        />
        {VEHICLE_DOCS.has(type) ? (
          profile.vehicles.length > 0 ? (
            <SelectField label="Vehicle" value={vehicleId} onChange={setVehicleId} options={profile.vehicles.map((v) => ({ value: v.vehicle.id, label: v.vehicle.name }))} />
          ) : (
            <Notice tone="info">Add the vehicle first to link this to it. You can still save it now.</Notice>
          )
        ) : (
          <SelectField label="Whose is it" value={holderId} onChange={setHolderId} options={profile.family.map((m) => ({ value: m.id, label: m.name === "You" ? "Me" : m.name }))} />
        )}
      </div>
      {HAS_EXPIRY.has(type) && (
        <div className={grid2}>
          <TextField label="Issued on" value={issuedOn} onChange={setIssuedOn} type="date" error={errors.issuedOn} />
          <TextField label="Expires on" value={expiresOn} onChange={setExpiresOn} type="date" error={errors.expiresOn} hint="We remind you before it lapses." />
        </div>
      )}
      <TextField label="Notes (optional)" value={notes} onChange={setNotes} />
      <FileField
        label={doc?.file ? "Replace the file (optional)" : "Photo or PDF"}
        prepared={file}
        onChange={setFile}
        disabled={!profile.uploadsEnabled}
        disabledReason="Sign in to attach files. Files are kept encrypted against your account. You can still save the details."
      />
      {failure && <Notice tone="error">{failure}</Notice>}
      <FormButtons busy={save.isPending} submitLabel={doc ? "Save changes" : "Save document"} onCancel={onDone} />
    </form>
  );
}

function DocumentRow({ doc, profile, onEdit }: { doc: Doc; profile: ProfileView; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const remove = useSetupAction(api.removeDocument);
  const pill = expiryPill(doc);
  const owner = doc.vehicleId ? profile.vehicles.find((v) => v.vehicle.id === doc.vehicleId)?.vehicle.name : profile.family.find((m) => m.id === doc.holderId)?.name;

  const view = async () => {
    setFailure(null);
    try {
      await api.openStoredFile(`/documents/${doc.id}/file`);
    } catch (err) {
      setFailure(errorMessage(err));
    }
  };

  return (
    <li className="card-base space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
          <FileText size={18} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-medium">{doc.type === "other" ? doc.label : doc.typeLabel}</p>
          <p className="truncate text-[13px] text-text-secondary">{[owner === "You" ? "Me" : owner, doc.numberDisplay].filter(Boolean).join(" · ") || "No number saved"}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {pill && <StatusPill tone={pill.tone}>{pill.text}</StatusPill>}
            {doc.file ? <StatusPill tone="accent">File stored</StatusPill> : <StatusPill tone="muted">No file</StatusPill>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {doc.file && (
          <Button size="sm" variant="secondary" onClick={() => void view()}>
            <Eye size={14} /> View
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil size={14} /> Edit
        </Button>
        {confirming ? (
          <span className="flex items-center gap-1">
            <span className="text-[13px] text-text-secondary">Delete it?</span>
            <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(doc.id, { onError: (err) => setFailure(errorMessage(err)) })}>
              Yes, delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} className="text-danger">
            <Trash2 size={14} /> Delete
          </Button>
        )}
      </div>
      {failure && <Notice tone="error">{failure}</Notice>}
    </li>
  );
}

export function DocumentsTab({ profile }: { profile: ProfileView }) {
  const [form, setForm] = useState<{ doc?: Doc; type?: DocumentType } | null>(null);
  const identity = profile.documents.filter((d) => !VEHICLE_DOCS.has(d.type) && d.type !== "other");
  const vehicle = profile.documents.filter((d) => VEHICLE_DOCS.has(d.type));
  const other = profile.documents.filter((d) => d.type === "other");

  const section = (title: string, docs: Doc[]) =>
    docs.length > 0 && (
      <section className="space-y-3" aria-label={title}>
        <h3 className="eyebrow">{title}</h3>
        <ul className="grid gap-3 md:grid-cols-2">
          {docs.map((doc) =>
            form?.doc?.id === doc.id ? (
              <li key={doc.id} className="md:col-span-2">
                <FormCard title={`Edit ${doc.type === "other" ? doc.label : doc.typeLabel}`} onClose={() => setForm(null)}>
                  <DocumentForm profile={profile} doc={doc} onDone={() => setForm(null)} />
                </FormCard>
              </li>
            ) : (
              <DocumentRow key={doc.id} doc={doc} profile={profile} onEdit={() => setForm({ doc })} />
            ),
          )}
        </ul>
      </section>
    );

  return (
    <div className="space-y-6">
      <p className="text-[15px] text-text-secondary">
        Keep your Aadhaar, PAN, licence and vehicle papers in one place. Files are encrypted, only you can open them, and expiry dates turn into reminders.
      </p>
      {!profile.uploadsEnabled && <Notice tone="info">Sign in to upload files. Without an account you can still save the details of each document.</Notice>}

      {form && !form.doc ? (
        <FormCard title="Add a document" onClose={() => setForm(null)}>
          <DocumentForm profile={profile} type={form.type} onDone={() => setForm(null)} />
        </FormCard>
      ) : (
        <div className="space-y-3">
          <Button variant="primary" onClick={() => setForm({})} className="w-full sm:w-auto">
            <Plus size={16} strokeWidth={1.75} />
            Add a document
          </Button>
          {profile.documents.length === 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Quick add">
              {QUICK_ADD.map((t) => (
                <button key={t} type="button" onClick={() => setForm({ type: t })} className="glass min-h-[44px] rounded-full px-4 text-[14px] hover:bg-surface-elevated">
                  {DOCUMENT_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {profile.documents.length === 0 && !form && (
        <div className="card-base flex items-center gap-4 p-5">
          <FileText size={22} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
          <p className="text-[14px] text-text-secondary">No documents yet. Start with your Aadhaar or PAN.</p>
        </div>
      )}

      {section("Identity", identity)}
      {section("Vehicle papers", vehicle)}
      {section("Other", other)}
    </div>
  );
}
