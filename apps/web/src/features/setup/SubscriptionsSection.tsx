import { useState, type FormEvent } from "react";
import { ExternalLink, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import {
  BILLING_CYCLES,
  SUBSCRIPTION_CATALOG,
  SUBSCRIPTION_PROVIDERS,
  SubscriptionInputSchema,
  type BillingCycle,
  type SubscriptionProvider,
} from "@household/contracts";
import { Button, StatusPill, type PillTone } from "@/components/ui/primitives";
import { useSetupAction } from "@/hooks/profile";
import * as api from "@/lib/profileApi";
import type { ProfileView } from "@/lib/profileApi";
import { FormButtons, FormCard, Notice, SelectField, TextField, errorMessage, grid2, num, today, validate } from "./kit";

type Sub = ProfileView["subscriptions"][number];

const CYCLE_LABEL: Record<BillingCycle, string> = { monthly: "Every month", quarterly: "Every 3 months", yearly: "Every year" };
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function duePill(sub: Sub): { tone: PillTone; text: string } {
  if (sub.daysUntilDue < 0) return { tone: "danger", text: `Overdue by ${-sub.daysUntilDue} day${sub.daysUntilDue === -1 ? "" : "s"}` };
  if (sub.daysUntilDue === 0) return { tone: "warning", text: "Due today" };
  if (sub.daysUntilDue <= 5) return { tone: "warning", text: `Due in ${sub.daysUntilDue} day${sub.daysUntilDue === 1 ? "" : "s"}` };
  return { tone: "muted", text: `Due ${sub.nextDueOn}` };
}

function SubscriptionForm({ sub, onDone }: { sub?: Sub | undefined; onDone: () => void }) {
  const [provider, setProvider] = useState<SubscriptionProvider>(sub?.provider ?? "netflix");
  const [name, setName] = useState(sub?.provider === "other" ? sub.name : "");
  const [plan, setPlan] = useState(sub?.plan ?? "");
  const [amount, setAmount] = useState(sub ? String(sub.amountInr) : "");
  const [cycle, setCycle] = useState<BillingCycle>(sub?.cycle ?? "monthly");
  const [nextDueOn, setNextDueOn] = useState(sub?.nextDueOn ?? today());
  const [payUrl, setPayUrl] = useState(sub && sub.payUrl !== SUBSCRIPTION_CATALOG[sub.provider].payUrl ? sub.payUrl : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const save = useSetupAction(async (input: Parameters<typeof api.addSubscription>[0]) => (sub ? api.updateSubscription(sub.id, input) : api.addSubscription(input, api.newKey())));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const parsed = validate(SubscriptionInputSchema, { provider, name, plan, amountInr: num(amount), cycle, nextDueOn, payUrl });
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    save.mutate(parsed.data, { onSuccess: onDone, onError: (err) => setFailure(errorMessage(err)) });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <SelectField label="Service" value={provider} onChange={setProvider} options={SUBSCRIPTION_PROVIDERS.map((value) => ({ value, label: SUBSCRIPTION_CATALOG[value].label }))} />
      {provider === "other" && <TextField label="Name" value={name} onChange={setName} error={errors.name} placeholder="For example: Gym membership" />}
      <div className={grid2}>
        <TextField label="Plan (optional)" value={plan} onChange={setPlan} placeholder="Standard, 2 screens" />
        <TextField label="Amount (₹)" value={amount} onChange={setAmount} type="number" error={errors.amountInr} />
      </div>
      <div className={grid2}>
        <SelectField label="Billed" value={cycle} onChange={setCycle} options={BILLING_CYCLES.map((value) => ({ value, label: CYCLE_LABEL[value] }))} />
        <TextField label="Next payment on" value={nextDueOn} onChange={setNextDueOn} type="date" error={errors.nextDueOn} />
      </div>
      <TextField
        label={provider === "other" ? "Where you pay (link)" : "Payment link (optional)"}
        value={payUrl}
        onChange={setPayUrl}
        error={errors.payUrl}
        placeholder="https://"
        hint={provider === "other" ? "The page that opens when you tap Pay. It must start with https://" : `Leave empty to use ${hostOf(SUBSCRIPTION_CATALOG[provider].payUrl || "https://example.com")}.`}
      />
      {failure && <Notice tone="error">{failure}</Notice>}
      <FormButtons busy={save.isPending} submitLabel={sub ? "Save changes" : "Add subscription"} onCancel={onDone} />
    </form>
  );
}

function SubscriptionRow({ sub, onEdit }: { sub: Sub; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const paid = useSetupAction(api.markSubscriptionPaid);
  const remove = useSetupAction(api.removeSubscription);
  const pill = duePill(sub);

  return (
    <li className="card-base space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tint-sky-subtle text-tint-sky">
          <Repeat size={18} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-medium">{sub.name}</p>
          <p className="truncate text-[13px] text-text-secondary">
            {rupees(sub.amountInr)} · {CYCLE_LABEL[sub.cycle].toLowerCase()}
            {sub.plan ? ` · ${sub.plan}` : ""}
          </p>
          <div className="mt-1.5">
            <StatusPill tone={pill.tone}>{pill.text}</StatusPill>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <a
          href={sub.payUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-small text-accent-text hover:bg-accent-hover"
        >
          Pay on {hostOf(sub.payUrl)} <ExternalLink size={14} />
        </a>
        <Button size="sm" variant="secondary" disabled={paid.isPending} onClick={() => paid.mutate(sub.id, { onError: (err) => setFailure(errorMessage(err)) })}>
          I've paid
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil size={14} /> Edit
        </Button>
        {confirming ? (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(sub.id, { onError: (err) => setFailure(errorMessage(err)) })}>
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

/** Netflix, Prime, Hotstar and other services that renew: when each is due and a Pay button that opens the service's own billing page. */
export function SubscriptionsSection({ profile }: { profile: ProfileView }) {
  const [form, setForm] = useState<{ sub?: Sub } | null>(null);
  const monthly = profile.subscriptions.reduce((sum, s) => sum + (s.cycle === "monthly" ? s.amountInr : s.cycle === "quarterly" ? s.amountInr / 3 : s.amountInr / 12), 0);

  return (
    <section className="space-y-4" aria-label="Subscriptions">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.03em]">Subscriptions</h2>
          <p className="text-[14px] text-text-secondary">
            Netflix, Prime, Hotstar, Spotify and the rest. Tap Pay to open the service's own payment page, then mark it paid here.
          </p>
        </div>
        {profile.subscriptions.length > 0 && <p className="text-[14px] text-text-secondary">About {rupees(monthly)} a month</p>}
      </div>

      {form && !form.sub ? (
        <FormCard title="Add a subscription" onClose={() => setForm(null)}>
          <SubscriptionForm onDone={() => setForm(null)} />
        </FormCard>
      ) : (
        <Button variant="secondary" onClick={() => setForm({})} className="w-full sm:w-auto">
          <Plus size={16} strokeWidth={1.75} />
          Add a subscription
        </Button>
      )}

      {profile.subscriptions.length === 0 && !form && (
        <div className="card-base flex items-center gap-4 p-5">
          <Repeat size={22} strokeWidth={1.5} className="shrink-0 text-text-tertiary" />
          <p className="text-[14px] text-text-secondary">No subscriptions yet. Add Netflix, Prime or any service that renews.</p>
        </div>
      )}

      {profile.subscriptions.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {profile.subscriptions.map((sub) =>
            form?.sub?.id === sub.id ? (
              <li key={sub.id} className="md:col-span-2">
                <FormCard title={`Edit ${sub.name}`} onClose={() => setForm(null)}>
                  <SubscriptionForm sub={sub} onDone={() => setForm(null)} />
                </FormCard>
              </li>
            ) : (
              <SubscriptionRow key={sub.id} sub={sub} onEdit={() => setForm({ sub })} />
            ),
          )}
        </ul>
      )}
    </section>
  );
}
