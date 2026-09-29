import { useState } from "react";
import { Check, Mic, PhoneCall } from "lucide-react";
import { SectionLabel } from "./ui";

const CHAIN = ["Purchase", "Inventory", "Meal", "Consumption", "Shortage", "Action"];

export function Difference() {
  return (
    <section aria-labelledby="diff-h" className="landing-container py-20 md:py-28">
      <SectionLabel>The difference</SectionLabel>
      <h2 id="diff-h" className="landing-section-title mt-4 max-w-2xl">
        Not another
        <br />
        reminder app.
      </h2>
      <p className="landing-lede mt-4 max-w-xl">
        Your household isn't a list of unrelated tasks. Everything affects
        something else.
      </p>
      <ol className="mx-auto mt-12 max-w-md" aria-label="Causal chain">
        {CHAIN.map((c, i) => (
          <li key={c} className="flex flex-col items-center">
            <span className="rounded-button border border-border bg-surface px-5 py-2.5 body-text font-medium">
              {c}
            </span>
            {i < CHAIN.length - 1 && (
              <span aria-hidden className="h-6 w-px bg-border-strong" />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

const STAGES = [
  { name: "Observe", title: "Intake Agent", body: "Receipts, voice, and household events become structured facts." },
  { name: "Understand", title: "State update", body: "Canonical inventory and obligations update — never LLM memory." },
  { name: "Predict", title: "Ripple + forecast", body: "One event fans out: shortages, expiry, competing meals." },
  { name: "Plan", title: "Action planner", body: "Deterministic math proposes the smallest sufficient action." },
  { name: "Ask", title: "Approval gate", body: "Privileged actions wait for you, with evidence attached." },
  { name: "Act", title: "Execution Agent", body: "Calls external services and performs approved actions — vendor calls, purchase requests, scheduling, confirmations." },
  { name: "Verify", title: "Reconciliation", body: "Vendor response parsed, inventory and forecast updated." },
];

export function AgenticWorkflow() {
  const [active, setActive] = useState(5);
  const stage = STAGES[active] ?? STAGES[0] ?? { name: "", title: "", body: "" };

  return (
    <section id="how" aria-labelledby="how-h" className="border-t border-border">
      <div className="landing-container grid gap-10 py-20 md:grid-cols-[1fr_1.2fr] md:py-28">
        <div>
          <SectionLabel>How it works</SectionLabel>
          <h2 id="how-h" className="landing-section-title mt-4">
            Observe.
            <br />
            Understand.
            <br />
            Act.
          </h2>
          <ol className="mt-8">
            {STAGES.map((s, i) => (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-pressed={active === i}
                  className={`flex min-h-[44px] w-full items-center gap-3 border-l-2 px-4 py-2 text-left transition-colors ${
                    active === i
                      ? "border-accent bg-accent-subtle/50"
                      : "border-border hover:border-border-strong"
                  }`}
                >
                  <span className="text-small font-medium tabular-nums text-text-tertiary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="body-text font-medium">{s.name}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-card border border-border bg-surface p-6 md:p-8" aria-live="polite">
          <p className="landing-eyebrow">{stage.name}</p>
          <p className="mt-2 text-xl font-semibold tracking-tight">{stage.title}</p>
          <p className="mt-2 body-text text-text-secondary">{stage.body}</p>
          {stage.name === "Act" && (
            <ul className="mt-4 space-y-2 text-small text-text-secondary">
              <li>· vendor calls</li>
              <li>· purchase requests</li>
              <li>· scheduling</li>
              <li>· confirmations</li>
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function VoiceAgent() {
  const [played, setPlayed] = useState(false);
  return (
    <section aria-labelledby="voice-h" className="border-t border-border bg-surface">
      <div className="landing-container grid gap-10 py-20 md:grid-cols-2 md:py-28">
        <div>
          <SectionLabel>Voice in</SectionLabel>
          <h2 id="voice-h" className="landing-section-title mt-4">Just say it.</h2>
          <blockquote className="mt-6 rounded-card border border-border bg-background p-5 body-text">
            “Naalaikku 6 perukku biryani pannanum.”
          </blockquote>
          <button
            type="button"
            onClick={() => setPlayed(true)}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-button bg-text-primary px-4 text-small font-medium text-white"
          >
            <Mic size={16} strokeWidth={1.75} aria-hidden />
            {played ? "Understood — see the parse" : "Hear how it's understood"}
          </button>
        </div>
        <div aria-live="polite">
          <ol className="space-y-0">
            {["Voice", "Intent", "Meal", "Inventory", "Action"].map((s, i) => (
              <li key={s} className="flex flex-col">
                <span
                  className={`rounded-button border px-4 py-3 body-text ${
                    !played && i > 0
                      ? "border-border text-text-tertiary"
                      : "border-border bg-background font-medium"
                  }`}
                >
                  {s}
                  {played && i === 1 && (
                    <span className="ml-2 text-small text-text-secondary">Plan meal · Biryani × 6</span>
                  )}
                  {played && i === 4 && (
                    <span className="ml-2 text-small text-warning">Chicken 800 g short</span>
                  )}
                </span>
                {i < 4 && <span aria-hidden className="mx-6 h-5 w-px bg-border-strong" />}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-small text-text-tertiary">
            Voice is an input mechanism, not the product itself.
          </p>
        </div>
      </div>
    </section>
  );
}

type ExecState = "review" | "approved" | "calling" | "connected" | "confirming" | "done";

const EXEC_LABEL: Record<ExecState, string> = {
  review: "Action required",
  approved: "Approved",
  calling: "Calling vendor…",
  connected: "Connected",
  confirming: "Confirming order…",
  done: "Completed",
};

export function ExecutionSection() {
  const [state, setState] = useState<ExecState>("review");

  const advance = () => {
    if (state === "review") {
      setState("approved");
      window.setTimeout(() => setState("calling"), 500);
      window.setTimeout(() => setState("connected"), 1600);
      window.setTimeout(() => setState("confirming"), 2600);
      window.setTimeout(() => setState("done"), 3600);
    } else if (state === "done") {
      setState("review");
    }
  };

  const stepIdx = (["review", "approved", "calling", "connected", "confirming", "done"] as ExecState[]).indexOf(state);

  return (
    <section id="technology" aria-labelledby="exec-h" className="border-t border-border">
      <div className="landing-container grid gap-10 py-20 md:grid-cols-2 md:py-28">
        <div>
          <SectionLabel>Execution · Snapserve</SectionLabel>
          <h2 id="exec-h" className="landing-section-title mt-4">
            Approved,
            <br />
            then done.
          </h2>
          <div className="mt-6 rounded-card border border-border bg-surface p-5">
            <p className="landing-eyebrow">{EXEC_LABEL[state]}</p>
            <p className="mt-2 body-text font-medium">Chicken · 800 g</p>
            <p className="text-small text-text-secondary">Needed for Biryani · 6 servings</p>
            <ol className="mt-4 space-y-2" aria-label="Execution progress">
              {(["Preparing", "Calling", "Connected", "Confirmed"] as const).map((s, i) => {
                const done = stepIdx >= i + 1;
                return (
                  <li key={s} className="flex items-center gap-2 text-small">
                    <span
                      aria-hidden
                      className={`inline-flex size-5 items-center justify-center rounded-full border ${
                        done ? "border-accent bg-accent-subtle text-accent" : "border-border text-text-tertiary"
                      }`}
                    >
                      {done && <Check size={12} strokeWidth={2} />}
                    </span>
                    <span className={done ? "text-text-primary" : "text-text-tertiary"}>{s}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <div className="flex flex-col justify-center rounded-card border border-border bg-surface-subtle p-6 md:p-8">
          <p className="flex items-center gap-2 body-text font-medium">
            <PhoneCall size={18} strokeWidth={1.75} aria-hidden className="text-accent" />
            {state === "review" ? "Review the proposal" : EXEC_LABEL[state]}
          </p>
          <p className="mt-2 text-small text-text-secondary">
            {state === "done"
              ? "Vendor confirmed for tomorrow morning. Inventory updated with +800 g incoming."
              : "Nothing happens until you approve. The call script, vendor, and quantities are fixed at approval time."}
          </p>
          <button
            type="button"
            onClick={advance}
            className={`mt-6 inline-flex min-h-[44px] items-center justify-center rounded-button px-4 text-small font-medium text-white ${
              state === "done" ? "bg-text-primary" : "bg-accent hover:bg-[#2A563B]"
            }`}
          >
            {state === "review" ? "Review & approve" : state === "done" ? "Reset demo" : "Working…"}
          </button>
        </div>
      </div>
    </section>
  );
}
