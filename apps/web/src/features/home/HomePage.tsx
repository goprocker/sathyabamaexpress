import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, ChevronDown, Sliders, Sparkles, X } from "lucide-react";
import { ModuleBadge, ModuleIcon, Toggle } from "@/components/ui/livora";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { useDecideSuggestion, useOverview, useResetLearning, useStarters, useSummary } from "@/hooks/life";
import type { Overview, Summary } from "@/lib/lifeApi";
import { useActiveProfile } from "@/lib/profile";
import { useStoredState } from "@/lib/storage";
import { addDays, dayLabel, loadByDay, rupees } from "@household/life";
import { MODULES, type ModuleId } from "@/lib/modules";

type HomeModule = "timeline" | "kitchen" | "admin" | "mobility" | "circular";

const moduleOptions: Array<{ id: HomeModule; label: string }> = [
  { id: "timeline", label: "Next 7 days" },
  { id: "kitchen", label: "SmartKitchen AI" },
  { id: "admin", label: "Life Administration" },
  { id: "mobility", label: "Smart Mobility" },
  { id: "circular", label: "Circular Living" },
];

const DEFAULTS: Record<HomeModule, boolean> = {
  timeline: true,
  kitchen: true,
  admin: true,
  mobility: true,
  circular: true,
};

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function HomePage() {
  const overview = useOverview();
  const summary = useSummary();
  return (
    <QueryBoundary query={overview}>
      {(data) => <HomeView data={data} summary={summary.data} />}
    </QueryBoundary>
  );
}

function HomeView({ data, summary }: { data: Overview; summary: Summary | undefined }) {
  const { today, events, collisions, suggestions, rejections } = data;
  const decideMutation = useDecideSuggestion();
  const resetLearning = useResetLearning();
  const starters = useStarters().data ?? [];
  const { active } = useActiveProfile();
  const navigate = useNavigate();
  const [shown, setShown] = useStoredState<Record<HomeModule, boolean>>("livora.home.modules", DEFAULTS);
  const [customising, setCustomising] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const top = suggestions.slice(0, 3);
  const tomorrow = addDays(today, 1);
  const tomorrowCount = events.filter((e) => e.date === tomorrow && e.kind !== "meal").length;
  const load = useMemo(() => loadByDay(events.filter((e) => e.kind !== "meal")), [events]);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const rejected = rejections;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void navigate({ to: "/assistant", search: { q: q.trim() || undefined } });
  };

  const brief =
    tomorrowCount > 0
      ? `${tomorrowCount} thing${tomorrowCount > 1 ? "s" : ""} tomorrow, ${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} ready to review.`
      : `Tomorrow is clear. ${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} ready to review.`;

  return (
    <div className="space-y-16">
      <header className="fade-in-up stagger-1">
        <p className="eyebrow mb-4">
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="hero-title max-w-[14ch]">
          {greeting()}, {active?.name.split(" ")[0] ?? "there"}
        </h1>
        <p className="mt-5 max-w-[46ch] text-[clamp(18px,2.2vw,24px)] leading-snug tracking-[-0.02em]">{brief}</p>

        <form onSubmit={submit} className="mt-8 max-w-[640px]">
          <label htmlFor="ask" className="sr-only">
            Ask LIVORA
          </label>
          <div className="glass flex items-center gap-2 rounded-full p-1.5 pl-5">
            <Sparkles size={18} strokeWidth={1.5} className="shrink-0 text-warning" />
            <input
              id="ask"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask about your day, groceries, spending, commute…"
              className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-text-tertiary"
            />
            <button type="submit" className="btn-primary !min-h-0 h-11 !rounded-full !px-5">
              Ask
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {starters.slice(0, 3).map((s) => (
              <Link
                key={s}
                to="/assistant"
                search={{ q: s }}
                className="glass rounded-full px-3.5 py-1.5 text-[13px] text-text-secondary transition-colors duration-[180ms] hover:text-text-primary"
              >
                {s}
              </Link>
            ))}
          </div>
        </form>
      </header>

      {/* What matters next */}
      <section aria-labelledby="next-title" className="fade-in-up stagger-2">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-1">Life Intelligence</p>
            <h2 id="next-title" className="section-title">
              What matters next
            </h2>
          </div>
          {rejected > 0 && (
            <button
              type="button"
              onClick={() => resetLearning.mutate()}
              className="text-[14px] text-text-secondary underline-offset-4 hover:underline"
            >
              Learned from {rejected} dismissal{rejected > 1 ? "s" : ""} · reset
            </button>
          )}
        </div>

        {top.length === 0 ? (
          <div className="card-base p-8 text-center">
            <p className="text-[20px] tracking-[-0.02em]">You're on top of everything.</p>
            <p className="mt-1 text-[14px] text-text-secondary">New suggestions appear as your schedule changes.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {top.map((s) => {
              const expanded = open === s.id;
              return (
                <li key={s.id} className="card-base flex flex-col p-5">
                  <ModuleBadge module={s.module} className="self-start" />
                  <h3 className="mt-4 text-[22px] leading-tight tracking-[-0.03em]">{s.title}</h3>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : s.id)}
                    className="mt-3 flex items-center gap-1 self-start text-[14px] text-text-secondary hover:text-text-primary"
                  >
                    Why this?
                    <ChevronDown
                      size={14}
                      strokeWidth={1.5}
                      className={`transition-transform duration-[180ms] ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  {expanded && (
                    <ul
                      className="mt-2 space-y-1.5 rounded-[16px] bg-surface-elevated p-3.5 text-[14px] text-text-secondary"
                      style={{ animation: "fadeIn 200ms var(--ease-out) both" }}
                    >
                      {s.why.map((w) => (
                        <li key={w} className="flex gap-2">
                          <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-text-tertiary" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-auto flex gap-2 pt-5">
                    <button
                      type="button"
                      className="btn-primary !min-h-0 h-11 flex-1 !rounded-full !px-4"
                      onClick={() => {
                        decideMutation.mutate({ suggestionId: s.id, kind: s.kind, decision: "accepted" });
                        void navigate({ to: s.href });
                      }}
                    >
                      <Check size={16} strokeWidth={1.75} />
                      {s.actionLabel}
                    </button>
                    <button
                      type="button"
                      aria-label={`Dismiss: ${s.title}`}
                      onClick={() => decideMutation.mutate({ suggestionId: s.id, kind: s.kind, decision: "rejected" })}
                      className="glass flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:text-text-primary"
                    >
                      <X size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Collision */}
      {collisions[0] && (
        <section
          aria-label="Deadline collision"
          className="card-base flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between fade-in-up"
        >
          <div className="flex items-start gap-4">
            <ModuleIcon module="admin" />
            <div>
              <p className="text-[20px] leading-tight tracking-[-0.03em]">
                {collisions[0].events.length} deadlines collide {dayLabel(collisions[0].start, today)} to{" "}
                {dayLabel(collisions[0].end, today)}
              </p>
              <p className="mt-1 text-[14px] text-text-secondary">
                {collisions[0].advice[0] ?? collisions[0].events.map((e) => e.title).join(", ")}
              </p>
            </div>
          </div>
          <Link to="/timeline" className="btn-secondary !min-h-0 h-11 shrink-0 !rounded-full !px-5">
            Adjust schedule
            <ArrowRight size={15} strokeWidth={1.5} />
          </Link>
        </section>
      )}

      {/* Week strip */}
      {shown.timeline && (
        <section aria-labelledby="week-title" className="fade-in-up">
          <div className="mb-4 flex items-end justify-between">
            <h2 id="week-title" className="section-title">
              Next 7 days
            </h2>
            <Link to="/timeline" className="flex items-center gap-1 text-[14px] text-text-secondary hover:text-text-primary">
              Full timeline <ArrowRight size={14} strokeWidth={1.5} />
            </Link>
          </div>
          <ul className="grid grid-cols-7 gap-2">
            {week.map((d) => {
              const l = load.get(d) ?? 0;
              const dayEvents = events.filter((e) => e.date === d && e.kind !== "meal");
              const [, , dd] = d.split("-");
              return (
                <li key={d}>
                  <Link
                    to="/timeline"
                    search={{ day: d }}
                    aria-label={`${dayLabel(d, today)}: ${dayEvents.length} events`}
                    className="card-interactive flex min-h-[112px] flex-col items-center justify-between p-2.5 sm:p-3"
                  >
                    <span className="mono-label">
                      {new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span className="text-[22px] tracking-[-0.03em]">{Number(dd)}</span>
                    <span className="flex h-2 items-center gap-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span key={e.id} aria-hidden className={`size-2 rounded-full ${MODULES[e.module].dot}`} />
                      ))}
                      {l === 0 && <span aria-hidden className="size-1 rounded-full bg-text-tertiary/40" />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Modules */}
      <section aria-labelledby="mod-title" className="fade-in-up">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="mod-title" className="section-title">
            Your modules
          </h2>
          <button
            type="button"
            aria-expanded={customising}
            onClick={() => setCustomising((v) => !v)}
            className="glass flex h-10 items-center gap-2 rounded-full px-4 text-[14px]"
          >
            <Sliders size={15} strokeWidth={1.5} />
            Customise
          </button>
        </div>

        {customising && (
          <ul
            className="card-base mb-3 divide-y divide-border p-2"
            style={{ animation: "fadeIn 200ms var(--ease-out) both" }}
          >
            {moduleOptions.map((m) => (
              <li key={m.id} className="flex min-h-[56px] items-center justify-between px-4">
                <span className="text-[16px]">{m.label}</span>
                <Toggle
                  checked={shown[m.id]}
                  onChange={(v) => setShown((prev) => ({ ...prev, [m.id]: v }))}
                  label={`Show ${m.label} on Home`}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {summary && shown.kitchen && (
            <ModuleCard
              module="kitchen"
              primary={`${summary.kitchen.lowCount} running low`}
              secondary={summary.kitchen.dinner ? `Dinner: ${summary.kitchen.dinner}` : "No dinner planned"}
            />
          )}
          {summary && shown.admin && (
            <ModuleCard
              module="admin"
              primary={`${summary.admin.attention} need attention`}
              secondary={`${rupees(summary.admin.billsDue14)} due in 14 days`}
            />
          )}
          {summary && shown.mobility && (
            <ModuleCard
              module="mobility"
              primary={`Leave by ${summary.mobility.leaveBy} tomorrow`}
              secondary={`EV at ${summary.mobility.batteryPct}% · ${rupees(summary.mobility.weekCost)} commute this week`}
            />
          )}
          {summary && shown.circular && (
            <ModuleCard
              module="circular"
              primary={`${summary.circular.wardrobeMatches} outfits ready for the wedding`}
              secondary={`${summary.circular.co2Saved} kg CO2e avoided (assumption-based)`}
            />
          )}
          {!summary && <div role="status" aria-label="Loading modules" className="card-base h-24 animate-pulse md:col-span-2" />}
        </div>
      </section>
    </div>
  );
}

function ModuleCard({ module, primary, secondary }: { module: ModuleId; primary: string; secondary: string }) {
  const m = MODULES[module];
  return (
    <Link to={m.to} className="card-interactive group flex items-center gap-4 p-5">
      <ModuleIcon module={module} size={52} />
      <div className="min-w-0 flex-1">
        <p className="mono-label">{m.label}</p>
        <p className="mt-0.5 truncate text-[22px] leading-tight tracking-[-0.03em]">{primary}</p>
        <p className="truncate text-[14px] text-text-secondary">{secondary}</p>
      </div>
      <ArrowRight
        size={18}
        strokeWidth={1.5}
        className="shrink-0 text-text-tertiary transition-transform duration-[180ms] group-hover:translate-x-1 group-hover:text-text-primary"
      />
    </Link>
  );
}
