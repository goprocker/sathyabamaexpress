// Obligations (PRD §14, Design §10 optional #14) — documents, vehicle,
// subscriptions, bills, appointments. The broader household scope beyond
// the kitchen. Grouped by domain; status follows the obligation lifecycle:
// ok → due_soon → overdue / action_proposed.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Car,
  FileText,
  Receipt,
  Repeat,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  Divider,
  ErrorState,
  ListSkeleton,
  StatusPill,
  type PillTone,
} from "@/components/ui/primitives";
import { useObligations } from "@/hooks/queries";
import { relativeDay } from "@/lib/format";
import type {
  Obligation,
  ObligationDomain,
  ObligationStatus,
} from "@/mocks/types";

const domainMeta: Record<
  ObligationDomain,
  { label: string; icon: typeof Car }
> = {
  document: { label: "Documents", icon: FileText },
  vehicle: { label: "Vehicle", icon: Car },
  subscription: { label: "Subscriptions", icon: Repeat },
  bill: { label: "Bills", icon: Receipt },
  appointment: { label: "Appointments", icon: CalendarDays },
};

const domainOrder: ObligationDomain[] = [
  "document",
  "vehicle",
  "bill",
  "subscription",
  "appointment",
];

const statusMeta: Record<ObligationStatus, { tone: PillTone; label: string }> = {
  ok: { tone: "neutral", label: "On track" },
  due_soon: { tone: "warning", label: "Due soon" },
  overdue: { tone: "danger", label: "Overdue" },
  action_proposed: { tone: "accent", label: "Action proposed" },
};

export function ObligationsPage() {
  const { data, isPending, isError, refetch } = useObligations();
  const [filter, setFilter] = useState<"all" | "attention">("all");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data;
    return data.filter(
      (o) => o.status === "due_soon" || o.status === "overdue" || o.status === "action_proposed",
    );
  }, [data, filter]);

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      attention: all.filter(
        (o) => o.status === "due_soon" || o.status === "overdue" || o.status === "action_proposed",
      ).length,
    };
  }, [data]);

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) return <ListSkeleton rows={8} />;

  const byDomain = new Map<ObligationDomain, Obligation[]>();
  for (const o of filtered) {
    const list = byDomain.get(o.domain) ?? [];
    list.push(o);
    byDomain.set(o.domain, list);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Obligations"
        subtitle="Documents, vehicle, bills, subscriptions and appointments — everything with a date attached."
        action={
          <div role="tablist" aria-label="Obligation filter" className="flex gap-1.5">
            {(["all", "attention"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`h-10 cursor-pointer rounded-button border px-4 text-small transition-colors duration-150 ${
                  filter === f
                    ? "border-accent/30 bg-accent-subtle font-medium text-accent"
                    : "border-border bg-surface text-text-secondary hover:border-border-strong"
                }`}
              >
                {f === "all"
                  ? "All"
                  : `Needs attention (${counts.attention})`}
              </button>
            ))}
          </div>
        }
      />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-small text-text-tertiary">
          Nothing needs attention. Every obligation is on track.
        </p>
      ) : (
        domainOrder
          .filter((d) => byDomain.has(d))
          .map((domain) => {
            const meta = domainMeta[domain];
            const Icon = meta.icon;
            const items = byDomain.get(domain)!;
            return (
              <section key={domain} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon size={16} strokeWidth={1.75} className="text-text-secondary" />
                  <h2 className="section-title">{meta.label}</h2>
                  <span className="text-meta">· {items.length}</span>
                </div>
                <Card className="px-5 py-1">
                  {items.map((o, idx) => (
                    <ObligationRow key={o.id} obligation={o} withDivider={idx > 0} />
                  ))}
                </Card>
              </section>
            );
          })
      )}
    </div>
  );
}

function ObligationRow({
  obligation,
  withDivider,
}: {
  obligation: Obligation;
  withDivider: boolean;
}) {
  const status = statusMeta[obligation.status];
  const hasLink = obligation.status === "action_proposed" && obligation.linkedActionId;

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="body-text font-medium">{obligation.title}</p>
          <span className="text-meta">{obligation.provider}</span>
        </div>
        <p className="text-small text-text-secondary">{obligation.detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {obligation.dueDate && (
          <span
            className={`text-small ${
              obligation.status === "overdue" ? "text-danger" : "text-text-secondary"
            }`}
          >
            {relativeDay(obligation.dueDate)}
          </span>
        )}
        {obligation.amount && (
          <span className="text-small font-medium">{obligation.amount}</span>
        )}
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
    </>
  );

  return (
    <div>
      {withDivider && <Divider />}
      {hasLink ? (
        <Link
          to="/actions"
          className="-mx-2 flex items-center gap-4 rounded-[6px] px-2 py-3 transition-colors duration-150 hover:bg-surface-subtle"
        >
          {body}
        </Link>
      ) : (
        <div className="-mx-2 flex items-center gap-4 px-2 py-3">{body}</div>
      )}
    </div>
  );
}
