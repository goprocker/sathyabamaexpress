// Stores the agent buys from, and phone ordering: call the agent's number from
// your registered phone, say what you need, and it calls the right store.
import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Phone, Star, Trash2 } from "lucide-react";
import type { StoreCategory, Vendor } from "@household/contracts";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Divider, EmptyState, Input, SectionHeader, StatusPill } from "@/components/ui/primitives";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import {
  useAddVendor,
  useOrdering,
  usePlaceOrder,
  useRemoveVendor,
  useSetOrderingPhone,
  useUpdateVendor,
  useVendors,
} from "@/hooks/life";

const CATEGORIES: Array<{ id: StoreCategory; label: string }> = [
  { id: "produce", label: "Vegetables & fruit" },
  { id: "dairy", label: "Milk & dairy" },
  { id: "protein", label: "Meat, fish & eggs" },
  { id: "grain", label: "Rice, atta & dal" },
  { id: "spice", label: "Spices & masala" },
  { id: "pantry", label: "Everything else" },
];

const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id || `${c.id}s` === id)?.label ?? id;

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");

export function StoresPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        eyebrow="Kitchen"
        title="Stores"
        subtitle="Add the shops you buy from. Call your agent, say what you need, and it calls the right store to order."
      />
      <PhoneOrderingCard />
      <OrderNowCard />
      <StoresSection />
    </div>
  );
}

function PhoneOrderingCard() {
  const ordering = useOrdering();
  const setPhone = useSetOrderingPhone();
  const [phone, setPhoneInput] = useState("");

  return (
    <section className="space-y-2">
      <SectionHeader>Order by phone</SectionHeader>
      <QueryBoundary query={ordering} rows={1}>
        {(setup) => (
          <Card className="space-y-4 px-5 py-4">
            {setup.agentNumber ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-meta">Call your agent</p>
                  <p className="text-[22px] font-medium tabular-nums">{setup.agentNumber}</p>
                </div>
                <a
                  href={`tel:${setup.agentNumber}`}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] text-accent-text"
                >
                  <Phone size={16} strokeWidth={1.75} />
                  Call
                </a>
              </div>
            ) : (
              <p className="text-small text-text-secondary">Phone ordering isn't set up on this server yet.</p>
            )}
            <p className="text-meta">
              Say something like “2 kg rice and a litre of milk”. The agent reads it back; when you say yes, it hangs up and
              calls the store. Progress shows in <Link to="/actions" className="text-accent underline">Actions</Link>.
            </p>
            <Divider />
            <form
              className="space-y-2"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (phone.trim()) setPhone.mutate(phone.trim(), { onSuccess: () => setPhoneInput("") });
              }}
            >
              <label htmlFor="ordering-phone" className="text-small font-medium">
                Your phone number
              </label>
              <p className="text-meta">
                {setup.ownerPhone
                  ? `Orders are accepted only from ${setup.ownerPhone}.`
                  : "Only calls from this number can place orders. Add it before you call."}
              </p>
              <div className="flex gap-2">
                <Input
                  id="ordering-phone"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={setup.ownerPhone ?? "98400 12345"}
                  value={phone}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
                <Button type="submit" variant="secondary" disabled={!phone.trim() || setPhone.isPending}>
                  Save
                </Button>
              </div>
              {setPhone.isError && (
                <p role="alert" className="text-small text-danger">
                  {errorText(setPhone.error)}
                </p>
              )}
            </form>
          </Card>
        )}
      </QueryBoundary>
    </section>
  );
}

function OrderNowCard() {
  const order = usePlaceOrder();
  const [items, setItems] = useState("");

  return (
    <section className="space-y-2">
      <SectionHeader>Or order from here</SectionHeader>
      <Card className="space-y-3 px-5 py-4">
        <form
          className="flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (items.trim()) order.mutate({ items: items.trim() }, { onSuccess: () => setItems("") });
          }}
        >
          <label htmlFor="order-items" className="sr-only">
            What do you need?
          </label>
          <Input
            id="order-items"
            placeholder="2 kg rice; 1 litre milk"
            value={items}
            onChange={(e) => setItems(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!items.trim() || order.isPending}>
            {order.isPending ? "Calling…" : "Order"}
          </Button>
        </form>
        <p className="text-meta">Sending this places the order: the agent calls each store right away.</p>
        {order.isError && (
          <p role="alert" className="text-small text-danger">
            {errorText(order.error)}
          </p>
        )}
        {order.data && (
          <div aria-live="polite" className="space-y-1">
            {order.data.actions.map((a) => (
              <p key={a.id} className="text-small">
                {a.vendor}: {a.quantity} · <span className="capitalize">{a.status.toLowerCase()}</span>
              </p>
            ))}
            {order.data.unassigned.length > 0 && (
              <p className="text-small text-warning">No store sells: {order.data.unassigned.join(", ")}</p>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}

function StoresSection() {
  const vendors = useVendors();
  return (
    <section className="space-y-2">
      <SectionHeader>Your stores</SectionHeader>
      <QueryBoundary query={vendors} rows={2}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState title="No stores yet." hint="Add the shop you usually buy from, with its phone number." />
          ) : (
            <Card className="px-5 py-1">
              {list.map((v, i) => (
                <div key={v.id}>
                  {i > 0 && <Divider />}
                  <StoreRow vendor={v} />
                </div>
              ))}
            </Card>
          )
        }
      </QueryBoundary>
      <AddStoreForm />
    </section>
  );
}

function StoreRow({ vendor }: { vendor: Vendor }) {
  const update = useUpdateVendor();
  const remove = useRemoveVendor();
  const categories = vendor.categories ?? (vendor.category ? [vendor.category] : []);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[16px] font-medium">
          {vendor.name}
          {vendor.isPreferred && <StatusPill tone="accent">Default</StatusPill>}
        </p>
        <p className="text-meta tabular-nums">{vendor.phoneE164}</p>
        <p className="mt-1 text-meta">{categories.map(categoryLabel).join(" · ")}</p>
      </div>
      <div className="flex gap-1">
        {!vendor.isPreferred && (
          <Button
            variant="ghost"
            size="sm"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: vendor.id, patch: { isPreferred: true } })}
          >
            <Star size={15} strokeWidth={1.75} />
            Make default
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Remove ${vendor.name}`}
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Remove ${vendor.name}?`)) remove.mutate(vendor.id);
          }}
        >
          <Trash2 size={15} strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}

function AddStoreForm() {
  const add = useAddVendor();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [categories, setCategories] = useState<StoreCategory[]>([]);

  const toggle = (id: StoreCategory) =>
    setCategories((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <Card className="px-5 py-4">
      <form
        className="space-y-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          add.mutate(
            { name: name.trim(), phone: phone.trim(), categories, isPreferred: false },
            {
              onSuccess: () => {
                setName("");
                setPhone("");
                setCategories([]);
              },
            },
          );
        }}
      >
        <p className="text-small font-medium">Add a store</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="store-name" className="sr-only">
              Store name
            </label>
            <Input id="store-name" placeholder="Store name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="store-phone" className="sr-only">
              Store phone number
            </label>
            <Input
              id="store-phone"
              inputMode="tel"
              placeholder="Phone, e.g. 98400 12345"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <fieldset>
          <legend className="text-meta">What it sells</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categories.includes(c.id)}
                onClick={() => toggle(c.id)}
                className={`min-h-[44px] rounded-full px-4 text-[14px] transition-colors duration-150 ${
                  categories.includes(c.id) ? "bg-accent text-accent-text" : "bg-surface-subtle text-text-secondary"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        {add.isError && (
          <p role="alert" className="text-small text-danger">
            {errorText(add.error)}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            disabled={name.trim().length < 2 || phone.trim().length < 8 || categories.length === 0 || add.isPending}
          >
            Add store
          </Button>
        </div>
      </form>
    </Card>
  );
}
