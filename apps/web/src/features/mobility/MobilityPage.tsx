import { useMemo, useState } from "react";
import { BatteryCharging, Check, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModuleIcon, SampleNote, SectionTitle, Segmented, Toggle } from "@/components/ui/livora";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { useChargePlan, useLeaveBy, useMobility, useRideRequest, useTripShare } from "@/hooks/life";
import type { Mobility } from "@/lib/lifeApi";
import { rupees, type TransportMode } from "@household/life";

type Pref = "fastest" | "cheapest" | "greenest" | "comfort";

const modeColour: Record<TransportMode, string> = {
  metro: "bg-tint-sky",
  ev: "bg-accent",
  bus: "bg-gold",
  cab: "bg-tint-coral",
};

export function MobilityPage() {
  const query = useMobility();
  return <QueryBoundary query={query}>{(data) => <MobilityView data={data} />}</QueryBoundary>;
}

function MobilityView({ data }: { data: Mobility }) {
  const { commute, vehicle, routes, week, weekTotal: total, savings, stations: stationsSorted, contacts, sharing, pools, requested } = data;
  const [pref, setPref] = useState<Pref>("fastest");
  const [arrival, setArrival] = useState(commute.meetingTomorrow.time);
  const [mode, setMode] = useState<TransportMode>("ev");
  const [target, setTarget] = useState(80);
  const leave = useLeaveBy(arrival, mode);
  const charge = useChargePlan(target);
  const share = useTripShare();
  const ride = useRideRequest();

  const ranked = useMemo(() => {
    const score = (r: (typeof routes)[number]) => {
      switch (pref) {
        case "fastest":
          return r.minutes;
        case "cheapest":
          return r.roundTripCost;
        case "greenest":
          return r.gramsPerKm;
        case "comfort":
          return -r.comfort;
      }
    };
    return [...routes].sort((a, b) => score(a) - score(b));
  }, [pref, routes]);

  const maxDay = Math.max(1, ...week.map((d) => d.cost));

  return (
    <div className="space-y-16">
      <PageHeader
        eyebrow="Smart Mobility AI"
        title="Predictable commutes"
        subtitle={`${commute.from} to ${commute.to} · ${commute.km} km`}
      />

      {/* Route planner */}
      <section aria-labelledby="route-title">
        <SectionTitle
          eyebrow="Journey planner"
          title="Best way to get there"
          action={
            <Segmented<Pref>
              label="Sort routes by"
              value={pref}
              onChange={setPref}
              options={[
                { id: "fastest", label: "Fastest" },
                { id: "cheapest", label: "Cheapest" },
                { id: "greenest", label: "Greenest" },
                { id: "comfort", label: "Comfort" },
              ]}
            />
          }
        />
        <ul className="space-y-2">
          {ranked.map((r, i) => (
            <li
              key={r.mode}
              className={`card-base flex flex-wrap items-center gap-x-6 gap-y-2 p-4 pl-5 transition-all duration-[180ms] ${
                i === 0 ? "ring-2 ring-accent" : ""
              }`}
            >
              <span aria-hidden className={`size-3 rounded-full ${modeColour[r.mode]}`} />
              <div className="min-w-[160px] flex-1">
                <p className="text-[20px] leading-tight tracking-[-0.03em]">
                  {r.label}
                  {i === 0 && <span className="ml-2 rounded-full bg-accent-subtle px-2 py-0.5 text-[12px] text-accent">Best for {pref}</span>}
                </p>
                <p className="text-[13px] text-text-tertiary">{r.note}</p>
              </div>
              <dl className="flex gap-6 text-right">
                <div>
                  <dt className="mono-label">Time</dt>
                  <dd className="text-[18px] tracking-[-0.02em]">{r.minutes} min</dd>
                </div>
                <div>
                  <dt className="mono-label">Round trip</dt>
                  <dd className="text-[18px] tracking-[-0.02em]">{rupees(r.roundTripCost)}</dd>
                </div>
                <div>
                  <dt className="mono-label">CO2e</dt>
                  <dd className="text-[18px] tracking-[-0.02em]">{r.co2Kg.toFixed(1)} kg</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <p className="mono-label mt-3">
          Times and fares are sample estimates. CO2e uses illustrative per-km assumptions.
        </p>
      </section>

      {/* Departure assistant */}
      <section aria-labelledby="dep-title" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="card-base p-5">
          <h2 id="dep-title" className="section-title mb-4">
            Departure assistant
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mono-label">Arrive by</span>
              <input
                type="time"
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
                className="glass mt-1.5 h-12 w-full rounded-full px-5 text-[16px] outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <label className="block">
              <span className="mono-label">Travelling by</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as TransportMode)}
                className="glass mt-1.5 h-12 w-full rounded-full px-4 text-[16px] outline-none focus:ring-2 focus:ring-accent"
              >
                {routes.map((r) => (
                  <option key={r.mode} value={r.mode}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-5 rounded-[24px] bg-accent-subtle p-5">
            <p className="mono-label !text-accent">Leave by</p>
            <p className="text-[56px] leading-none tracking-[-0.05em] text-accent" aria-live="polite">{leave.data?.leaveBy ?? "--:--"}</p>
            <p className="mt-2 text-[14px] text-text-secondary">
              {leave.data?.minutes ?? "…"} min journey plus a {leave.data?.bufferMin ?? 15} min buffer.
            </p>
          </div>
        </div>

        {/* Expense tracker */}
        <div className="card-base p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="section-title">Commute this week</h2>
            <p className="text-[28px] tracking-[-0.04em]">{rupees(total)}</p>
          </div>
          <div className="flex h-36 items-end gap-2" role="list">
            {week.map((d) => {
              const c = d.cost;
              return (
                <div key={d.day} role="listitem" className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" aria-label={`${d.day}: ${d.mode}, ${rupees(c)}`}>
                  <span className="text-[12px] text-text-secondary">{rupees(c)}</span>
                  <span className={`w-full rounded-[14px] ${modeColour[d.mode]}`} style={{ height: `${Math.max(8, (c / maxDay) * 78)}%` }} />
                  <span className="mono-label">{d.day}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 rounded-[20px] bg-surface-elevated p-4 text-[14px]">
            Swapping {savings.cabDays} cab days for the metro would save about{" "}
            <strong className="font-medium">{rupees(savings.weekly)}</strong> a week for roughly 10 extra minutes each way.
          </p>
        </div>
      </section>

      {/* EV */}
      <section aria-labelledby="ev-title">
        <SectionTitle eyebrow="EV charging assistant" title={vehicle.name} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div className="card-base p-5 lg:col-span-2">
            <div className="flex items-center gap-4">
              <ModuleIcon module="mobility" size={52} />
              <div>
                <p className="text-[44px] leading-none tracking-[-0.05em]">{vehicle.batteryPct}%</p>
                <p className="text-[14px] text-text-secondary">about {vehicle.rangeKm} km of range</p>
              </div>
            </div>
            <div
              role="progressbar"
              aria-label="Battery"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={vehicle.batteryPct}
              className="relative mt-5 h-3 overflow-hidden rounded-full bg-surface-elevated"
            >
              <div className="h-full rounded-full bg-gradient-to-r from-tint-sky to-accent" style={{ width: `${vehicle.batteryPct}%` }} />
              <div className="absolute inset-y-0 w-0.5 bg-text-primary/40" style={{ left: `${target}%` }} />
            </div>
            <label className="mt-5 block">
              <span className="flex justify-between text-[14px]">
                <span className="text-text-secondary">Charge to</span>
                <span>{target}%</span>
              </span>
              <input
                type="range"
                min={vehicle.batteryPct}
                max={100}
                value={Math.max(target, vehicle.batteryPct)}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--color-accent)]"
              />
            </label>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[16px] bg-surface-elevated p-3.5">
                <dt className="mono-label">Energy</dt>
                <dd className="text-[22px] tracking-[-0.03em]">{(charge.data?.kwh ?? 0).toFixed(1)} kWh</dd>
              </div>
              <div className="rounded-[16px] bg-surface-elevated p-3.5">
                <dt className="mono-label">At home</dt>
                <dd className="text-[22px] tracking-[-0.03em]">{rupees(charge.data?.homeCost ?? 0)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[14px] text-text-secondary">
              Recommended: charge overnight at home. It avoids fast-charge tariffs and keeps you above 60%.
            </p>
          </div>

          <div className="card-base p-5 lg:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[20px] tracking-[-0.03em]">Nearby stations</h3>
              <SampleNote>Sample availability</SampleNote>
            </div>
            <ul className="space-y-2">
              {stationsSorted.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-[16px] bg-surface-elevated px-4 py-3">
                  <BatteryCharging size={20} strokeWidth={1.5} className="shrink-0 text-tint-sky" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] leading-tight tracking-[-0.02em]">{s.name}</span>
                    <span className="block text-[13px] text-text-tertiary">
                      {s.km} km · {s.kw} kW · ₹{s.tariff}/kWh
                    </span>
                  </span>
                  <span className="text-right">
                    <span
                      className={`block rounded-full px-2.5 py-0.5 text-[12px] ${
                        s.free > 0 ? "bg-success-bg text-success" : "bg-warning-bg text-warning"
                      }`}
                    >
                      {s.free}/{s.ports} free
                    </span>
                    <span className="block text-[12px] text-text-tertiary">{s.waitMin === 0 ? "No wait" : `~${s.waitMin} min wait`}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Journey sharing + pools */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="card-base p-5">
          <h2 className="section-title mb-1">Trusted journey sharing</h2>
          <p className="mb-4 text-[14px] text-text-secondary">
            Choose who can follow your trip until you arrive. Nothing is sent in this demo.
          </p>
          <ul className="divide-y divide-border">
            {contacts.map((c) => (
              <li key={c.id} className="flex min-h-[60px] items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-tint-sky-subtle text-tint-sky">{c.name.slice(0, 1)}</span>
                  <span>
                    <span className="block text-[16px] leading-tight">{c.name}</span>
                    <span className="text-[13px] text-text-tertiary">{c.relation}</span>
                  </span>
                </span>
                <Toggle
                  checked={sharing.includes(c.id)}
                  onChange={(v) => share.mutate({ contactId: c.id, enabled: v })}
                  label={`Share trip with ${c.name}`}
                />
              </li>
            ))}
          </ul>
          <p className="mono-label mt-3" aria-live="polite">
            {sharing.length === 0 ? "Not sharing" : `Ready to share with ${sharing.length} contact${sharing.length > 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="card-base p-5">
          <div className="mb-1 flex items-center gap-2">
            <Users size={20} strokeWidth={1.5} />
            <h2 className="section-title">Shared commutes</h2>
          </div>
          <p className="mb-4 flex items-start gap-2 text-[14px] text-text-secondary">
            <ShieldCheck size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-accent" />
            Verified riders only, masked phone numbers, public pickup points.
          </p>
          <ul className="space-y-2">
            {pools.map((p) => {
              const asked = requested.includes(p.id);
              return (
                <li key={p.id} className="rounded-[20px] bg-surface-elevated p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[17px] leading-tight tracking-[-0.02em]">{p.route}</p>
                      <p className="text-[13px] text-text-tertiary">
                        {p.time} · {p.seats} seat{p.seats > 1 ? "s" : ""} · {rupees(p.cost)} · {p.co}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-success-bg px-2.5 py-0.5 text-[12px] text-success">{p.verified}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => ride.mutate({ poolId: p.id, enabled: !asked })}
                    className={`mt-3 h-10 rounded-full px-5 text-[14px] ${asked ? "btn-secondary !min-h-0" : "btn-primary !min-h-0"}`}
                  >
                    {asked ? (
                      <>
                        <Check size={14} strokeWidth={2} /> Requested · undo
                      </>
                    ) : (
                      "Request a seat"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mono-label mt-3">Sample listings. Real matching needs verified accounts.</p>
        </div>
      </section>
    </div>
  );
}
