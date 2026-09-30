import { useState, type FormEvent } from "react";
import { Check, Plus, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { SampleNote, SectionTitle, Segmented } from "@/components/ui/livora";
import {
  useAddListing,
  useAddWardrobe,
  useCircular,
  useOccasionPlan,
  useSetFactors,
} from "@/hooks/life";
import type { Circular } from "@/lib/lifeApi";
import { defaultFactors, dayLabel, rupees, todayIso, type ListingType, type WardrobeCategory } from "@household/life";

type Need = "Ethnic" | "Accessory";

export function CircularPage() {
  const query = useCircular();
  return <QueryBoundary query={query}>{(data) => <CircularView data={data} />}</QueryBoundary>;
}

function CircularView({ data }: { data: Circular }) {
  const { wardrobe: closet, listings: market, occasion, activity, co2Saved: co2 } = data;
  const [filter, setFilter] = useState<"All" | WardrobeCategory>("All");
  const [listFilter, setListFilter] = useState<"all" | ListingType>("all");
  const [picked, setPicked] = useState<Record<Need, string | null>>({ Ethnic: "w1", Accessory: "w7" });
  const [factors, setFactorsLocal] = useState(data.factors);
  const [showAdd, setShowAdd] = useState(false);
  const [showList, setShowList] = useState(false);

  const planQuery = useOccasionPlan(picked);
  const addWardrobe = useAddWardrobe();
  const addListingMutation = useAddListing();
  const saveFactors = useSetFactors();

  const result = planQuery.data;
  const plan = result?.plan ?? [];
  const options = result?.options ?? [];
  const covered = result?.covered ?? false;
  const missingCount = result?.missingCount ?? 0;
  const cheapest = result?.cheapest ?? null;
  const matches = (n: Need) => plan.find((p) => p.need === n)?.matches ?? [];
  const eventDate = occasion.date;
  const today = todayIso();

  const shownCloset = closet.filter((w) => filter === "All" || w.category === filter);
  const shownListings = market.filter((l) => listFilter === "all" || l.type === listFilter);

  const changeFactor = (key: "garment" | "household", value: number) => {
    const next = { ...factors, [key]: value };
    setFactorsLocal(next);
    saveFactors.mutate(next);
  };

  const addItem = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return;
    addWardrobe.mutate(
      { name, category: String(f.get("category")) as WardrobeCategory, occasion: String(f.get("occasion") ?? "casual") },
      {
        onSuccess: () => {
          form.reset();
          setShowAdd(false);
        },
      },
    );
  };

  const addListing = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const title = String(f.get("title") ?? "").trim();
    if (!title) return;
    addListingMutation.mutate(
      { title, type: String(f.get("type")) as ListingType, perDay: Number(f.get("perDay") ?? 0) },
      {
        onSuccess: () => {
          form.reset();
          setShowList(false);
        },
      },
    );
  };

  return (
    <div className="space-y-16">
      <PageHeader
        eyebrow="Circular Living AI"
        title="Own less, reuse more"
        subtitle="Start with what's in your wardrobe, then borrow, then rent. Buying comes last."
      />

      {/* Occasion planner */}
      <section aria-labelledby="occ-title">
        <SectionTitle eyebrow="Smart occasion planner" title={`${occasion.name} · ${dayLabel(eventDate, today)}`} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div className="card-base space-y-4 p-5 lg:col-span-3">
            <p className="text-[14px] text-text-secondary">{occasion.need}. Pick what you'll wear from your wardrobe.</p>
            {plan.map((p) => (
              <div key={p.need}>
                <p className="mono-label mb-2">{p.need === "Ethnic" ? "Outfit" : "Jewellery and accessories"}</p>
                <div className="flex flex-wrap gap-2">
                  {matches(p.need).map((w) => {
                    const on = picked[p.need] === w.id;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPicked((s) => ({ ...s, [p.need]: on ? null : w.id }))}
                        className={`flex min-h-[44px] items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4 text-[14px] transition-all duration-[180ms] ${
                          on ? "bg-accent text-accent-text" : "glass"
                        }`}
                      >
                        <span aria-hidden className={`size-7 rounded-full border border-white/60 ${w.swatch}`} />
                        {w.name}
                        {on && <Check size={14} strokeWidth={2} />}
                      </button>
                    );
                  })}
                  {matches(p.need).length === 0 && (
                    <span className="text-[14px] text-text-tertiary">No matching pieces in your wardrobe.</span>
                  )}
                </div>
                {!p.own && (
                  <p className="mt-2 text-[13px] text-text-secondary">
                    {p.borrow ? `Borrow: ${p.borrow.title} (${p.borrow.owner})` : p.rent ? `Rent: ${p.rent.title}, ${rupees(p.rent.perDay)}/day` : "No sharing options nearby."}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="card-base p-5 lg:col-span-2">
            <h3 className="mb-3 text-[20px] tracking-[-0.03em]">Cost comparison</h3>
            <dl className="space-y-2">
              {options.map((r) => {
                const best = r.value !== null && r.value === cheapest;
                return (
                  <div
                    key={r.label}
                    className={`flex items-center justify-between rounded-[16px] px-4 py-3 ${best ? "bg-accent-subtle" : "bg-surface-elevated"}`}
                  >
                    <span>
                      <span className="block text-[16px] leading-tight">{r.label}</span>
                      <span className="text-[12px] text-text-tertiary">{r.note}</span>
                    </span>
                    <span className="text-[20px] tracking-[-0.03em]">{r.value === null ? "n/a" : rupees(r.value)}</span>
                  </div>
                );
              })}
            </dl>
            <p className="mt-3 text-[13px] text-text-secondary">
              {covered
                ? "You're fully covered from your wardrobe. Rent and buy show what you'd pay without it. Deselect a piece to see the gap."
                : `${missingCount} item${missingCount > 1 ? "s" : ""} still needed. Prices cover only those.`}
            </p>
          </div>
        </div>
      </section>

      {/* Wardrobe */}
      <section aria-labelledby="wd-title">
        <SectionTitle
          eyebrow="Digital wardrobe"
          title={`${closet.length} pieces`}
          action={
            <button type="button" onClick={() => setShowAdd((v) => !v)} aria-expanded={showAdd} className="btn-primary !min-h-0 h-10 !rounded-full !px-4">
              <Plus size={16} strokeWidth={1.75} />
              Add piece
            </button>
          }
        />
        {showAdd && (
          <form onSubmit={addItem} className="card-base mb-3 grid gap-3 p-5 sm:grid-cols-4" style={{ animation: "fadeIn 200ms var(--ease-out) both" }}>
            <input name="name" required aria-label="Item name" placeholder="Item name" className="glass h-12 rounded-full px-5 outline-none focus:ring-2 focus:ring-accent sm:col-span-2" />
            <select name="category" aria-label="Category" className="glass h-12 rounded-full px-4 outline-none">
              {["Ethnic", "Formal", "Casual", "Accessory"].map((c) => <option key={c}>{c}</option>)}
            </select>
            <select name="occasion" aria-label="Occasion" className="glass h-12 rounded-full px-4 outline-none">
              {["Wedding", "Festival", "Office", "Casual", "Travel"].map((c) => <option key={c}>{c}</option>)}
            </select>
            <button type="submit" className="btn-primary sm:col-span-4 !rounded-full">Save to wardrobe</button>
          </form>
        )}
        <div className="mb-4">
          <Segmented<"All" | WardrobeCategory>
            label="Wardrobe category"
            value={filter}
            onChange={setFilter}
            options={(["All", "Ethnic", "Formal", "Casual", "Accessory"] as const).map((c) => ({ id: c, label: c }))}
          />
        </div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {shownCloset.map((w) => (
            <li key={w.id} className="card-base p-3">
              <div className={`aspect-[4/3] rounded-[20px] ${w.swatch}`} aria-hidden />
              <p className="mt-3 line-clamp-2 px-1 text-[15px] leading-tight tracking-[-0.02em]">{w.name}</p>
              <p className="mono-label px-1 pb-1 pt-1">
                {w.category} · worn {w.worn}×
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Marketplace */}
      <section aria-labelledby="mk-title">
        <SectionTitle
          eyebrow="Community marketplace"
          title="Rent, lend, exchange"
          action={
            <button type="button" onClick={() => setShowList((v) => !v)} aria-expanded={showList} className="btn-secondary !min-h-0 h-10 !rounded-full !px-4">
              <Plus size={16} strokeWidth={1.75} />
              List an item
            </button>
          }
        />
        {showList && (
          <form onSubmit={addListing} className="card-base mb-3 grid gap-3 p-5 sm:grid-cols-4" style={{ animation: "fadeIn 200ms var(--ease-out) both" }}>
            <input name="title" required aria-label="Listing title" placeholder="What are you sharing?" className="glass h-12 rounded-full px-5 outline-none focus:ring-2 focus:ring-accent sm:col-span-2" />
            <select name="type" aria-label="Listing type" className="glass h-12 rounded-full px-4 outline-none">
              <option value="rent">Rent</option>
              <option value="lend">Lend</option>
              <option value="exchange">Exchange</option>
            </select>
            <input name="perDay" type="number" min={0} aria-label="Price per day" placeholder="₹ per day" className="glass h-12 rounded-full px-5 outline-none focus:ring-2 focus:ring-accent" />
            <button type="submit" className="btn-primary sm:col-span-4 !rounded-full">Publish listing</button>
          </form>
        )}
        <div className="mb-4">
          <Segmented<"all" | ListingType>
            label="Listing type"
            value={listFilter}
            onChange={setListFilter}
            options={[
              { id: "all", label: "All" },
              { id: "rent", label: "Rent" },
              { id: "lend", label: "Lend" },
              { id: "exchange", label: "Exchange" },
            ]}
          />
        </div>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {shownListings.map((l) => (
            <li key={l.id} className="card-base flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-full bg-tint-teal-subtle px-2.5 py-0.5 text-[12px] capitalize text-tint-teal">{l.type}</span>
                {l.verified && (
                  <span className="flex items-center gap-1 text-[12px] text-success">
                    <ShieldCheck size={13} strokeWidth={1.75} /> Verified
                  </span>
                )}
              </div>
              <p className="mt-3 text-[19px] leading-tight tracking-[-0.03em]">{l.title}</p>
              <p className="mt-1 text-[13px] text-text-tertiary">
                {l.owner} · {l.km ? `${l.km} km away` : "your listing"}
              </p>
              <p className="mt-auto pt-4 text-[20px] tracking-[-0.03em]">{l.perDay > 0 ? `${rupees(l.perDay)}/day` : l.type === "exchange" ? "Swap" : "Free"}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <SampleNote>Sample listings. Verification and payments need a live marketplace.</SampleNote>
        </div>
      </section>

      {/* Sustainability */}
      <section aria-labelledby="sus-title" className="card-base p-5 md:p-6">
        <SectionTitle eyebrow="Sustainability dashboard" title="Impact you can verify" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="text-[64px] leading-none tracking-[-0.05em]">
              {co2}
              <span className="ml-2 text-[20px] tracking-normal text-text-secondary">kg CO2e avoided</span>
            </p>
            <p className="mt-2 text-[14px] text-text-secondary">
              {activity.length} verified reuse activities × the assumptions on the right. Change them to see how the estimate moves.
            </p>
            <ul className="mt-4 space-y-1.5">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-[16px] bg-surface-elevated px-4 py-2.5 text-[14px]">
                  <span>{a.what}</span>
                  <span className="mono-label">{factors[a.type]} kg</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[24px] bg-surface-subtle p-5">
            <h3 className="text-[18px] tracking-[-0.02em]">Assumptions</h3>
            <p className="mb-4 text-[13px] text-text-secondary">
              Illustrative avoided emissions per reused item. Not a measured value. Replace with your own source.
            </p>
            {(["garment", "household"] as const).map((k) => (
              <label key={k} className="mb-4 block last:mb-0">
                <span className="flex justify-between text-[14px]">
                  <span className="capitalize">{k} reused</span>
                  <span>{factors[k]} kg each</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={factors[k]}
                  onChange={(e) => changeFactor(k, Number(e.target.value))}
                  className="mt-2 w-full accent-[var(--color-accent)]"
                />
              </label>
            ))}
            <button type="button" onClick={() => {
                setFactorsLocal(defaultFactors);
                saveFactors.mutate(defaultFactors);
              }} className="text-[13px] text-text-secondary underline-offset-4 hover:underline">
              Reset to defaults
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
