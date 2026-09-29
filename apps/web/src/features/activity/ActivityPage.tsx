// Activity timeline (Design System §20) + state transition log + agent trace detail (§21)
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Divider,
  ErrorState,
  ListSkeleton,
  SectionHeader,
  StatusPill,
} from "@/components/ui/primitives";
import { useActivity, useAgentTrace, useStateDiff } from "@/hooks/queries";

const kindDot: Record<string, string> = {
  meal: "bg-accent",
  inventory: "bg-accent/50",
  receipt: "bg-text-tertiary",
  action: "bg-warning",
  alert: "bg-danger",
  agent: "bg-accent",
};

export function ActivityPage() {
  const activity = useActivity();
  const trace = useAgentTrace();
  const stateDiff = useStateDiff();
  const [showTrace, setShowTrace] = useState(false);

  const transitions = stateDiff.data?.recentTransitions ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity"
        subtitle="Everything the system observed, mutated and verified."
        action={
          stateDiff.data ? (
            <StatusPill tone="neutral">
              State v{stateDiff.data.stateVersion}
            </StatusPill>
          ) : undefined
        }
      />

      {/* STATE TRANSITIONS ("WHAT CHANGED?") */}
      {transitions.length > 0 && (
        <section className="space-y-2">
          <SectionHeader>State transitions (what changed)</SectionHeader>
          <div className="rounded-card border border-border bg-surface px-5 py-2">
            <div className="divide-y divide-border">
              {transitions.slice(0, 8).map((t, idx) => (
                <div
                  key={`${t.entityId}-${t.field}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-small"
                >
                  <div>
                    <span className="font-medium text-text-primary">
                      {t.entityName}
                    </span>
                    <span className="ml-2 text-meta">
                      {t.entityType} · {t.field}
                    </span>
                  </div>
                  <div className="tabular-nums text-text-secondary">
                    {t.before} →{" "}
                    <span className="font-medium text-accent">{t.after}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {transitions.length > 0 && <Divider />}

      {/* EVENT TIMELINE */}
      <section className="space-y-2">
        <SectionHeader>Event timeline</SectionHeader>
        {activity.isError ? (
          <ErrorState onRetry={() => void activity.refetch()} />
        ) : activity.isPending ? (
          <ListSkeleton rows={6} />
        ) : (
          <ol className="pt-1">
            {activity.data.map((e, idx) => (
              <li key={e.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-[7px] size-1.5 shrink-0 rounded-full ${kindDot[e.kind] ?? "bg-text-tertiary"}`}
                  />
                  {idx < activity.data.length - 1 && (
                    <span className="w-px grow bg-border" />
                  )}
                </div>
                <div className="flex-1 pb-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-small font-medium">{e.title}</p>
                    <span className="text-meta">{e.time}</span>
                  </div>
                  <p className="text-small text-text-secondary">{e.description}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Agent trace — hidden behind an explicit interaction (§21) */}
      <section className="space-y-2">
        <button
          onClick={() => setShowTrace((v) => !v)}
          aria-expanded={showTrace}
          className="inline-flex cursor-pointer items-center gap-1 text-small text-text-secondary transition-colors duration-150 hover:text-text-primary"
        >
          {showTrace ? (
            <ChevronDown size={14} strokeWidth={1.75} />
          ) : (
            <ChevronRight size={14} strokeWidth={1.75} />
          )}
          Agent trace details
        </button>
        {showTrace &&
          (trace.isPending ? (
            <ListSkeleton rows={3} />
          ) : (
            <div className="rounded-card border border-border bg-surface px-5 py-3">
              {trace.data?.map((s, i) => (
                <div key={i} className="flex items-baseline gap-3 py-1.5">
                  <span className="w-28 shrink-0 text-small font-medium">{s.agent}</span>
                  <span className="text-small text-text-secondary">{s.detail}</span>
                </div>
              ))}
            </div>
          ))}
      </section>
    </div>
  );
}

