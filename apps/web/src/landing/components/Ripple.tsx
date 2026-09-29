import { useEffect, useState } from "react";
import { Check, Minus, Plus, TriangleAlert, X } from "lucide-react";
import { getWhy, simulateMeal } from "@/lib/api";
import { formatQuantity } from "@/lib/format";
import type { MealSimulation } from "@/mocks/types";
import { SectionLabel } from "./ui";

function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("is-visible");
        });
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export function RippleSignature() {
  useReveal();
  return (
    <section aria-labelledby="ripple-h" className="landing-container py-20 md:py-28">
      <SectionLabel>Signature · Ripple</SectionLabel>
      <h2 id="ripple-h" className="landing-section-title mt-4 max-w-2xl">
        One meal.
        <br />
        Every consequence.
      </h2>

      <div className="reveal mt-12 rounded-card border border-border bg-surface p-6 md:p-10">
        <p className="text-center body-text font-semibold tracking-tight">
          Biryani · 6 servings
        </p>
        <div className="mx-auto mt-8 max-w-2xl">
          {/* Desktop: horizontal nodes, mobile: stacked */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-button border border-border p-4">
              <p className="text-small font-medium">Rice · 1.2 kg</p>
              <p className="mt-1 flex items-center gap-1.5 text-small text-accent">
                <Check size={16} strokeWidth={1.75} aria-hidden /> Available
              </p>
            </div>
            <div className="rounded-button border border-warning/30 bg-warning-subtle p-4">
              <p className="text-small font-medium">Chicken · 700 g</p>
              <p className="mt-1 flex items-center gap-1.5 text-small text-warning">
                <TriangleAlert size={16} strokeWidth={1.75} aria-hidden /> 800 g
                short
              </p>
            </div>
          </div>
          <svg
            viewBox="0 0 400 90"
            role="img"
            aria-label="Rice available, chicken flows to shortage then purchase"
            className="mx-auto my-2 h-20 w-full max-w-md"
          >
            <line x1="200" y1="0" x2="200" y2="30" className="ripple-line-alert" />
            <rect x="120" y="32" width="160" height="26" rx="6" fill="#F8F0DC" stroke="#9A6B16" />
            <text x="200" y="50" textAnchor="middle" fontSize="13" fill="#9A6B16">
              800 g short
            </text>
            <line x1="200" y1="58" x2="200" y2="88" className="ripple-line-alert" />
          </svg>
          <div className="mx-auto max-w-md rounded-button bg-accent p-4 text-center">
            <p className="text-small font-medium text-white">Purchase needed</p>
            <p className="text-small text-white/70">800 g chicken · before tomorrow dinner</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function RippleInteractive() {
  const [servings, setServings] = useState(6);
  const [sim, setSim] = useState<MealSimulation | null>(null);
  const [pending, setPending] = useState(true);
  const [whyOpen, setWhyOpen] = useState(false);
  const [why, setWhy] = useState<{ rows: { label: string; value: string }[]; summary: string } | null>(null);

  useEffect(() => {
    let live = true;
    setPending(true);
    void simulateMeal("rcp_biryani", servings).then((s) => {
      if (live) {
        setSim(s);
        setPending(false);
      }
    });
    return () => {
      live = false;
    };
  }, [servings]);

  useEffect(() => {
    if (!whyOpen) return;
    let live = true;
    void getWhy("ing_chicken").then((w) => {
      if (live) setWhy({ rows: w.rows, summary: w.summary });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWhyOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [whyOpen]);

  const step = (d: number) =>
    setServings((s) => Math.min(10, Math.max(2, s + d)));

  return (
    <section aria-labelledby="try-h" className="border-t border-border bg-surface">
      <div className="landing-container grid gap-10 py-20 md:grid-cols-2 md:py-28">
        <div>
          <SectionLabel>Try it · Plan a meal</SectionLabel>
          <h2 id="try-h" className="landing-section-title mt-4">
            Biryani
          </h2>
          <p className="mt-2 body-text text-text-secondary">
            {servings} servings · Tomorrow · Dinner
          </p>
          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              aria-label="Fewer servings"
              onClick={() => step(-2)}
              className="inline-flex size-11 items-center justify-center rounded-button border border-border-strong hover:bg-surface-subtle"
            >
              <Minus size={18} />
            </button>
            <p className="min-w-16 text-center text-2xl font-semibold tabular-nums" aria-live="polite">
              {servings}
            </p>
            <button
              type="button"
              aria-label="More servings"
              onClick={() => step(2)}
              className="inline-flex size-11 items-center justify-center rounded-button border border-border-strong hover:bg-surface-subtle"
            >
              <Plus size={18} />
            </button>
            <div className="flex gap-2" role="group" aria-label="Quick servings">
              {[4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setServings(n)}
                  aria-pressed={servings === n}
                  className={`h-11 min-w-[44px] rounded-[6px] border px-3 text-small ${
                    servings === n
                      ? "border-accent bg-accent text-white"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-6 text-small text-text-tertiary">
            Quantities come from the mock API layer — the same shapes the real
            backend will serve.
          </p>
        </div>

        <div aria-live="polite">
          <p className="landing-eyebrow">Household state</p>
          {pending || !sim ? (
            <div className="mt-4 space-y-3" role="status" aria-label="Loading simulation">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-button bg-surface-subtle" />
              ))}
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-card border border-border">
              {sim.rows.map((r) => {
                const short = (r.shortfall ?? 0) > 0;
                return (
                  <li key={r.itemId}>
                    <button
                      type="button"
                      disabled={!short}
                      onClick={() => short && setWhyOpen(true)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${
                        short ? "cursor-pointer hover:bg-surface-subtle" : ""
                      }`}
                      aria-label={
                        short
                          ? `${r.name}, ${formatQuantity(r.shortfall ?? 0, r.unit)} short. Open explanation.`
                          : `${r.name}, available`
                      }
                    >
                      <span>
                        <span className="body-text font-medium">{r.name}</span>
                        <span className="block text-small text-text-tertiary tabular-nums">
                          {formatQuantity(r.required, r.unit)} needed ·{" "}
                          {formatQuantity(r.available, r.unit)} on hand
                        </span>
                      </span>
                      {short ? (
                        <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-warning-subtle px-2.5 py-1.5 text-small font-medium text-warning">
                          <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />
                          {formatQuantity(r.shortfall ?? 0, r.unit)} short
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-accent-subtle px-2.5 py-1.5 text-small font-medium text-accent">
                          <Check size={16} strokeWidth={1.75} aria-hidden />
                          OK
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {whyOpen && (
        <div role="dialog" aria-modal="true" aria-label="Why is chicken short?" className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close explanation"
            onClick={() => setWhyOpen(false)}
            className="absolute inset-0 cursor-default bg-black/25"
          />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-surface shadow-[0_8px_24px_rgba(23,23,23,0.06)]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <p className="landing-eyebrow">Why?</p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setWhyOpen(false)}
                className="inline-flex size-11 items-center justify-center rounded-button hover:bg-surface-subtle"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-6 overflow-auto px-5 py-6">
              <div>
                <p className="body-text font-medium">Tomorrow's meal · Biryani × {servings}</p>
                <p className="mt-1 text-small text-text-secondary">
                  {why?.summary ?? "Tomorrow's biryani needs more chicken than we have."}
                </p>
              </div>
              <dl className="divide-y divide-border rounded-card border border-border">
                {(why?.rows ?? []).map((r) => (
                  <div key={r.label} className="flex items-center justify-between px-4 py-3">
                    <dt className="text-small text-text-secondary">{r.label}</dt>
                    <dd className="text-small font-medium tabular-nums">{r.value}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <p className="landing-eyebrow">Based on</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-small text-text-secondary">
                  <li>planned meal</li>
                  <li>current inventory</li>
                  <li>recent purchases</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
