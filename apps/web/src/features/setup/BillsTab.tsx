import { useState, type FormEvent } from "react";
import { Eye, Plus, Trash2, Zap } from "lucide-react";
import { ElectricityBillInputSchema } from "@household/contracts";
import { Button, StatusPill, type PillTone } from "@/components/ui/primitives";
import { useSetupAction } from "@/hooks/profile";
import type { PreparedFile } from "@/lib/image";
import * as api from "@/lib/profileApi";
import type { ProfileView } from "@/lib/profileApi";
import { CheckField, FileField, FormButtons, FormCard, Notice, TextField, errorMessage, grid2, num, validate } from "./kit";

type Bill = ProfileView["bills"][number];

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function billPill(bill: Bill): { tone: PillTone; text: string } {
  if (bill.paid) return { tone: "accent", text: "Paid" };
  if (bill.daysUntilDue < 0) return { tone: "danger", text: `Overdue by ${-bill.daysUntilDue} day${bill.daysUntilDue === -1 ? "" : "s"}` };
  if (bill.daysUntilDue <= 14) return { tone: "warning", text: bill.daysUntilDue === 0 ? "Due today" : `Due in ${bill.daysUntilDue} days` };
  return { tone: "muted", text: `Due ${bill.dueDate}` };
}

function BillForm({ uploadsEnabled, onDone }: { uploadsEnabled: boolean; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [units, setUnits] = useState("");
  const [period, setPeriod] = useState("");
  const [consumerNo, setConsumerNo] = useState("");
  const [paid, setPaid] = useState(false);
  const [file, setFile] = useState<PreparedFile | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);
  const [reading, setReading] = useState(false);
  const save = useSetupAction(async (args: { input: Parameters<typeof api.addElectricityBill>[0]; file: File | undefined }) => api.addElectricityBill(args.input, args.file, api.newKey()));

  const readIt = async () => {
    if (!file?.previewUrl) return;
    setReading(true);
    setFailure(null);
    try {
      const { fields } = await api.readBill("electricity_bill", file.file);
      if (fields.amountInr) setAmount(String(fields.amountInr));
      if (fields.dueDate) setDueDate(fields.dueDate);
      if (fields.units) setUnits(String(fields.units));
      if (fields.billingPeriod) setPeriod(fields.billingPeriod);
      if (fields.consumerNo) setConsumerNo(fields.consumerNo);
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
    const parsed = validate(ElectricityBillInputSchema, { amountInr: num(amount), dueDate, units: num(units), billingPeriod: period, consumerNo, paid });
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
        <TextField label="Amount (₹)" value={amount} onChange={setAmount} type="number" error={errors.amountInr} />
        <TextField label="Due date" value={dueDate} onChange={setDueDate} type="date" error={errors.dueDate} hint="We remind you before this date." />
      </div>
      <div className={grid2}>
        <TextField label="Units used (kWh, optional)" value={units} onChange={setUnits} type="number" error={errors.units} />
        <TextField label="Billing period (optional)" value={period} onChange={setPeriod} placeholder="Aug to Sep" />
      </div>
      <TextField label="Consumer number (optional)" value={consumerNo} onChange={setConsumerNo} />
      <CheckField label="Already paid" checked={paid} onChange={setPaid} />
      {failure && <Notice tone="error">{failure}</Notice>}
      <FormButtons busy={save.isPending} submitLabel="Save bill" onCancel={onDone} />
    </form>
  );
}

function BillRow({ bill }: { bill: Bill }) {
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const toggle = useSetupAction((paid: boolean) => api.markBillPaid(bill.id, paid));
  const remove = useSetupAction(api.removeBill);
  const pill = billPill(bill);

  return (
    <li className="card-base space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold-subtle text-warning">
          <Zap size={18} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-semibold tracking-[-0.02em]">{rupees(bill.amountInr)}</p>
          <p className="truncate text-[13px] text-text-secondary">
            {[bill.billingPeriod, bill.units !== undefined ? `${bill.units} kWh` : null, bill.consumerNo ? `No. ${bill.consumerNo}` : null].filter(Boolean).join(" · ") || "Electricity bill"}
          </p>
          <div className="mt-1.5">
            <StatusPill tone={pill.tone}>{pill.text}</StatusPill>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant={bill.paid ? "ghost" : "primary"} disabled={toggle.isPending} onClick={() => toggle.mutate(!bill.paid, { onError: (err) => setFailure(errorMessage(err)) })}>
          {bill.paid ? "Mark unpaid" : "Mark as paid"}
        </Button>
        {bill.file && (
          <Button size="sm" variant="secondary" onClick={() => void api.openStoredFile(`/bills/electricity/${bill.id}/file`).catch((e) => setFailure(errorMessage(e)))}>
            <Eye size={14} /> View bill
          </Button>
        )}
        {confirming ? (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(bill.id, { onError: (err) => setFailure(errorMessage(err)) })}>
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

export function BillsTab({ profile }: { profile: ProfileView }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-5">
      <p className="text-[15px] text-text-secondary">
        Add your electricity bill and we remind you before it is due. Petrol and diesel bills go with each vehicle, under Vehicles, where they also work out your real mileage.
      </p>

      {adding ? (
        <FormCard title="Add an electricity bill" onClose={() => setAdding(false)}>
          <BillForm uploadsEnabled={profile.uploadsEnabled} onDone={() => setAdding(false)} />
        </FormCard>
      ) : (
        <Button variant="primary" onClick={() => setAdding(true)} className="w-full sm:w-auto">
          <Plus size={16} strokeWidth={1.75} />
          Add an electricity bill
        </Button>
      )}

      {profile.bills.length === 0 && !adding ? (
        <div className="card-base flex items-center gap-4 p-5">
          <Zap size={22} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
          <p className="text-[14px] text-text-secondary">No bills yet. Add this month's electricity bill.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {profile.bills.map((bill) => (
            <BillRow key={bill.id} bill={bill} />
          ))}
        </ul>
      )}
    </div>
  );
}
