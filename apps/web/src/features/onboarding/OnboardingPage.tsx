// Onboarding (Design System §22) — keep it short.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Mic, ScanLine } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Divider } from "@/components/ui/primitives";

const domains = ["Kitchen", "Bills", "Documents", "Vehicle", "Subscriptions"];

export function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set(["Kitchen"]));
  const navigate = useNavigate();

  function toggle(domain: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        title={step === 1 ? "Set up your household" : step === 2 ? "Add your first receipt" : "You're ready"}
        subtitle={`Step ${step} of 3`}
      />

      {step === 1 && (
        <div className="space-y-4">
          <p className="body-text text-text-secondary">
            What should we help manage?
          </p>
          <div className="space-y-2">
            {domains.map((d) => (
              <label
                key={d}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-card border border-border bg-surface px-4 py-2.5 transition-colors duration-150 has-checked:border-accent/40 has-checked:bg-accent-subtle"
              >
                <input
                  type="checkbox"
                  checked={selected.has(d)}
                  onChange={() => toggle(d)}
                  className="size-4 accent-[#356B4A]"
                />
                <span className="body-text">{d}</span>
              </label>
            ))}
          </div>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => setStep(2)}
            disabled={selected.size === 0}
          >
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <button
            onClick={() => setStep(3)}
            className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-border-strong px-6 py-10 transition-colors duration-150 hover:border-accent/40"
          >
            <ScanLine size={20} strokeWidth={1.5} className="text-text-tertiary" />
            <span className="body-text font-medium">Upload receipt</span>
            <span className="text-small text-text-tertiary">
              Demo: continues to the last step
            </span>
          </button>
          <Button variant="ghost" className="w-full" onClick={() => setStep(3)}>
            Skip for now
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-card border border-accent/25 bg-accent-subtle px-5 py-4">
            <Check size={18} strokeWidth={2} className="text-accent" />
            <p className="mt-2 body-text font-medium">Household is set up.</p>
            <Divider />
            <p className="pt-3 text-small text-text-secondary">Try saying:</p>
            <p className="mt-1 flex items-center gap-2 text-small text-text-primary">
              <Mic size={14} strokeWidth={1.75} className="text-text-secondary" />
              “Naalaikku 4 perukku dosa pannanum.”
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => void navigate({ to: "/" })}>
              Go to dashboard
            </Button>
            <Button variant="secondary" onClick={() => void navigate({ to: "/voice" })}>
              Try voice
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
