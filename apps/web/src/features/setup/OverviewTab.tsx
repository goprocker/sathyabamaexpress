import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Check, Circle, Info, ShieldCheck } from "lucide-react";
import type { SetupStepId } from "@household/contracts";
import { Button } from "@/components/ui/primitives";
import { useSetupAction } from "@/hooks/profile";
import * as api from "@/lib/profileApi";
import type { ProfileView } from "@/lib/profileApi";
import { Notice, errorMessage } from "./kit";

export type SetupTab = "overview" | SetupStepId;

const tabFromHref = (href: string): SetupTab => {
  const tab = new URLSearchParams(href.split("?")[1] ?? "").get("tab");
  return (["family", "documents", "vehicles", "bills", "vendors"] as const).find((t) => t === tab) ?? "overview";
};

const severityStyle = {
  urgent: "border-l-danger bg-danger-subtle",
  warning: "border-l-warning bg-warning-subtle",
  info: "border-l-border-strong bg-surface-subtle",
} as const;

export function OverviewTab({ profile, onOpen }: { profile: ProfileView; onOpen: (tab: SetupTab) => void }) {
  const { progress, reminders } = profile;
  const [failure, setFailure] = useState<string | null>(null);
  const navigate = useNavigate();
  // Setup reminders open their tab; others (a subscription renewal) open the page they belong to.
  const openReminder = (href: string) => (href.startsWith("/onboarding") ? onOpen(tabFromHref(href)) : void navigate({ to: href }));
  const skip = useSetupAction((args: { step: Exclude<SetupStepId, "family">; skipped: boolean }) => api.skipStep(args.step, args.skipped));
  const next = progress.steps.find((s) => s.id === progress.nextStep);
  const doneCount = progress.steps.filter((s) => s.done || s.skipped).length;

  return (
    <div className="space-y-8">
      <section className="card-base space-y-4 p-5" aria-label="Progress">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="mono-label mb-1">Your setup</p>
            <p className="text-[44px] font-semibold leading-none tracking-[-0.04em]">{progress.percent}%</p>
          </div>
          <p className="pb-1 text-[14px] text-text-secondary">
            {doneCount} of {progress.steps.length} steps done
          </p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${progress.percent}%` }} />
        </div>
        {next ? (
          <Button variant="primary" onClick={() => onOpen(next.id)} className="w-full sm:w-auto">
            Continue with {next.label.toLowerCase()}
            <ArrowRight size={16} strokeWidth={1.75} />
          </Button>
        ) : (
          <Notice tone="success">Everything is set up. Keep it fresh by logging trips, fuel and bills as you go.</Notice>
        )}
      </section>

      {reminders.length > 0 && (
        <section className="space-y-3" aria-label="Needs attention">
          <h2 className="eyebrow">Needs attention</h2>
          <ul className="space-y-2">
            {reminders.map((r) => (
              <li key={r.id} className={`flex items-start gap-3 rounded-[12px] border-l-4 p-4 ${severityStyle[r.severity]}`}>
                {r.severity === "info" ? <Info size={18} className="mt-0.5 shrink-0 text-text-secondary" /> : <AlertTriangle size={18} className={`mt-0.5 shrink-0 ${r.severity === "urgent" ? "text-danger" : "text-warning"}`} />}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">{r.title}</p>
                  <p className="text-[13px] text-text-secondary">{r.detail}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => openReminder(r.href)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3" aria-label="Steps">
        <h2 className="eyebrow">Steps</h2>
        <ul className="space-y-2">
          {progress.steps.map((step) => {
            const finished = step.done || step.skipped;
            return (
              <li key={step.id} className="card-base flex items-start gap-3 p-4">
                <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${finished ? "bg-accent text-accent-text" : "border border-border-strong text-text-tertiary"}`}>
                  {finished ? <Check size={16} strokeWidth={2} /> : <Circle size={10} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-medium">{step.label}</p>
                  <p className="text-[13px] text-text-secondary">{step.skipped && !step.done ? "Skipped, not needed" : `${step.hint} · ${step.detail}`}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Button size="sm" variant={step.done ? "ghost" : "secondary"} onClick={() => onOpen(step.id)}>
                      {step.done ? "Manage" : "Open"}
                    </Button>
                    {step.id !== "family" && !step.done && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={skip.isPending}
                        onClick={() => skip.mutate({ step: step.id as Exclude<SetupStepId, "family">, skipped: !step.skipped }, { onError: (err) => setFailure(errorMessage(err)) })}
                      >
                        {step.skipped ? "Undo skip" : "Not for us"}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {failure && <Notice tone="error">{failure}</Notice>}
      </section>

      <p className="flex items-start gap-2.5 text-[13px] text-text-tertiary">
        <ShieldCheck size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
        Your documents are encrypted before they are stored and only open for your account. Identity numbers are never kept in full, only the last four digits.
      </p>
    </div>
  );
}
