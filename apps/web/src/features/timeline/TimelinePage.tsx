import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { Check, ChevronRight, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModuleIcon } from "@/components/ui/livora";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { useApplyCollision, useOverview } from "@/hooks/life";
import type { Overview } from "@/lib/lifeApi";
import { addDays, dayLabel, loadByDay } from "@household/life";
import { MODULES, type ModuleId } from "@/lib/modules";

const HORIZON = 21;
const ALL: ModuleId[] = ["kitchen", "admin", "mobility", "circular", "personal"];

export function TimelinePage() {
  const overview = useOverview();
  return <QueryBoundary query={overview}>{(data) => <TimelineView data={data} />}</QueryBoundary>;
}

function TimelineView({ data }: { data: Overview }) {
  const { today, events, collisions } = data;
  const apply = useApplyCollision();
  const search = useSearch({ strict: false }) as { day?: string };
  const [active, setActive] = useState<ModuleId[]>(ALL);
  const [selected, setSelected] = useState<string | null>(search.day ?? null);
  const dayRefs = useRef<Record<string, HTMLElement | null>>({});

  const visible = useMemo(
    () => events.filter((e) => active.includes(e.module) && e.date <= addDays(today, HORIZON)),
    [events, active, today],
  );
  const days = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const e of visible) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [visible]);
  const load = useMemo(() => loadByDay(events.filter((e) => e.kind !== "meal")), [events]);
  const strip = Array.from({ length: HORIZON }, (_, i) => addDays(today, i));
  const maxLoad = Math.max(1, ...strip.map((d) => load.get(d) ?? 0));
  const collisionDays = new Set(collisions.flatMap((c) => c.events.map((e) => e.date)));

  useEffect(() => {
    if (selected) dayRefs.current[selected]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected]);

  const toggle = (m: ModuleId) =>
    setActive((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  return (
    <div>
      <PageHeader
        eyebrow="Personal Life Timeline"
        title="Everything, in order"
        subtitle="Bills, meals, trips, commutes and events on one calendar, with conflicts flagged before they bite."
      />

      {/* Load strip */}
      <section aria-label="Workload for the next three weeks" className="card-base mb-6 p-5">
        <div className="flex h-24 items-end gap-1" role="list">
          {strip.map((d) => {
            const l = load.get(d) ?? 0;
            const hot = collisionDays.has(d);
            const isSel = selected === d;
            return (
              <button
                key={d}
                type="button"
                role="listitem"
                aria-label={`${dayLabel(d, today)}, load ${l}${hot ? ", deadline collision" : ""}`}
                aria-pressed={isSel}
                onClick={() => setSelected(isSel ? null : d)}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
              >
                <span
                  className={`w-full rounded-full transition-all duration-[180ms] ${
                    hot ? "bg-tint-coral" : "bg-accent"
                  } ${isSel ? "opacity-100" : "opacity-55 group-hover:opacity-90"}`}
                  style={{ height: `${Math.max(8, (l / maxLoad) * 100)}%` }}
                />
                <span className={`mono-label ${isSel ? "!text-text-primary" : ""}`}>{Number(d.slice(8))}</span>
              </button>
            );
          })}
        </div>
        <p className="mono-label mt-3 flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-tint-coral" /> Collision window
          <span aria-hidden className="ml-3 size-2 rounded-full bg-accent" /> Normal load
        </p>
      </section>

      {/* Collisions */}
      {collisions.length > 0 && (
        <section aria-label="Deadline collisions" className="mb-6 space-y-3">
          {collisions.map((c) => {
            const done = c.applied;
            return (
              <div key={c.id} className="card-base p-5">
                <div className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-tint-coral-subtle text-tint-coral">
                    <TriangleAlert size={20} strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[20px] leading-tight tracking-[-0.03em]">
                      {c.events.length} responsibilities within three days
                    </p>
                    <p className="mt-1 text-[14px] text-text-secondary">
                      {dayLabel(c.start, today)} to {dayLabel(c.end, today)} ·{" "}
                      {c.events.map((e) => e.title).join(" · ")}
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {c.advice.map((a) => (
                        <li key={a} className="flex gap-2 text-[15px]">
                          <ChevronRight size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-tint-coral" />
                          {a}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        disabled={done || apply.isPending}
                        onClick={() => apply.mutate({ id: c.id, enabled: true })}
                        className="btn-primary !min-h-0 h-10 !rounded-full !px-5 disabled:opacity-70"
                      >
                        {done ? (
                          <>
                            <Check size={15} strokeWidth={2} /> Added to your plan
                          </>
                        ) : (
                          "Add to my plan"
                        )}
                      </button>
                      {done && (
                        <button
                          type="button"
                          onClick={() => apply.mutate({ id: c.id, enabled: false })}
                          className="btn-secondary !min-h-0 h-10 !rounded-full !px-5"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by module">
        {ALL.map((m) => {
          const on = active.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(m)}
              className={`flex min-h-[40px] items-center gap-2 rounded-full px-4 text-[14px] transition-all duration-[180ms] ${
                on ? "glass" : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              <span aria-hidden className={`size-2.5 rounded-full ${on ? MODULES[m].dot : "bg-text-tertiary/40"}`} />
              {MODULES[m].label}
            </button>
          );
        })}
      </div>

      {/* Day list */}
      {days.length === 0 ? (
        <div className="card-base p-10 text-center text-[16px] text-text-secondary">
          Nothing scheduled for the selected modules.
        </div>
      ) : (
        <ol className="space-y-3">
          {days.map(([date, list]) => (
            <li
              key={date}
              ref={(el) => {
                dayRefs.current[date] = el;
              }}
              className={`card-base p-5 transition-shadow duration-[180ms] ${
                selected === date ? "ring-2 ring-accent" : ""
              }`}
            >
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[24px] tracking-[-0.03em]">{dayLabel(date, today)}</h2>
                {collisionDays.has(date) && (
                  <span className="rounded-full bg-tint-coral-subtle px-2.5 py-0.5 text-[12px] text-tint-coral">
                    Busy window
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                {list.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={e.href}
                      className="flex items-center gap-3 rounded-[16px] bg-surface-elevated px-3.5 py-3 transition-transform duration-[180ms] hover:-translate-y-0.5"
                    >
                      <ModuleIcon module={e.module} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] leading-tight tracking-[-0.02em]">{e.title}</span>
                        <span className="block truncate text-[13px] text-text-tertiary">{e.detail}</span>
                      </span>
                      {e.time && <span className="mono-label shrink-0">{e.time}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
