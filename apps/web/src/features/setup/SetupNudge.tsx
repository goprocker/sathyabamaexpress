import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ClipboardList } from "lucide-react";
import { useProfile } from "@/hooks/profile";
import { authEnabled } from "@/lib/auth";

/**
 * For a signed-in household that has not finished Setup: sends a first-time user
 * straight to it, and shows a progress card on Home until every step is done.
 * Does nothing in demo mode, where the sample household is already filled in.
 */
export function SetupNudge() {
  const { data } = useProfile({ enabled: authEnabled });
  const navigate = useNavigate();
  const firstVisit = Boolean(data) && !data?.startedAt;

  useEffect(() => {
    if (firstVisit) void navigate({ to: "/onboarding", replace: true });
  }, [firstVisit, navigate]);

  if (!authEnabled || !data || data.progress.percent === 100) return null;
  const next = data.progress.steps.find((s) => s.id === data.progress.nextStep);

  return (
    <Link to="/onboarding" search={{ tab: next?.id }} className="card-interactive group flex items-center gap-4 p-5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
        <ClipboardList size={22} strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-medium tracking-[-0.02em]">Finish setting up · {data.progress.percent}% done</p>
        <p className="truncate text-[14px] text-text-secondary">{next ? `Next: ${next.label.toLowerCase()}. ${next.hint}` : "Almost there"}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="h-full rounded-full bg-accent" style={{ width: `${data.progress.percent}%` }} />
        </div>
      </div>
      <ArrowRight size={18} strokeWidth={1.5} className="shrink-0 text-text-tertiary transition-transform duration-[180ms] group-hover:translate-x-1" />
    </Link>
  );
}
