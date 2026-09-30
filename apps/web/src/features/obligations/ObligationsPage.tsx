// Obligations (PRD §14, Design §10 optional #14) — documents, vehicle,
// subscriptions, bills, appointments. The broader household scope beyond
// the kitchen. Grouped by domain; status follows the obligation lifecycle:
// ok → due_soon → overdue / action_proposed.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Car,
  ExternalLink,
  FileText,
  Receipt,
  Repeat,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Divider,
  ErrorState,
  ListSkeleton,
  StatusPill,
  type PillTone,
} from "@/components/ui/primitives";
import { useObligations } from "@/hooks/queries";
import { useSetupAction } from "@/hooks/profile";
import * as profileApi from "@/lib/profileApi";
import { useOverview } from "@/hooks/life";
import { dayLabel } from "@household/life";
import { TriangleAlert } from "lucide-react";
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
  const overview = useOverview();
  const collisions = overview.data?.collisions ?? [];
  const today = overview.data?.today ?? "";

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
        eyebrow="Life Administration AI"
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

      {collisions.length > 0 && (
        <section aria-label="Deadline collision detector" className="space-y-3">
          {collisions.map((c) => (
            <div key={c.id} className="card-base flex items-start gap-4 p-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-tint-coral-subtle text-tint-coral">
                <TriangleAlert size={20} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <p className="mono-label">Deadline collision detector</p>
                <p className="text-[20px] leading-tight tracking-[-0.03em]">
                  {c.events.map((e) => e.title).join(" · ")}
                </p>
                <p className="mt-1 text-[14px] text-text-secondary">
                  {dayLabel(c.start, today)} to {dayLabel(c.end, today)}
                </p>
                {c.advice.map((a) => (
                  <p key={a} className="mt-1.5 text-[15px]">
                    {a}
                  </p>
                ))}
                <Link to="/timeline" className="mt-3 inline-block text-[14px] text-accent underline-offset-4 hover:underline">
                  Review on timeline
                </Link>
              </div>
            </div>
          ))}
        </section>
      )}

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

/** A subscription's obligation id is `obl_p_sub:<id>`; the id after the prefix is what the profile API knows it by. */
const SUBSCRIPTION_PREFIX = "obl_p_sub:";

function ObligationRow({
  obligation,
  withDivider,
}: {
  obligation: Obligation;
  withDivider: boolean;
}) {
  const status = statusMeta[obligation.status];
  const hasLink = obligation.status === "action_proposed" && obligation.linkedActionId;
  const subscriptionId = obligation.id.startsWith(SUBSCRIPTION_PREFIX) ? obligation.id.slice(SUBSCRIPTION_PREFIX.length) : null;
  const markPaid = useSetupAction(profileApi.markSubscriptionPaid);
  const [failure, setFailure] = useState<string | null>(null);
  const host = obligation.payUrl ? new URL(obligation.payUrl).hostname.replace(/^www\./, "") : null;

  const body = (
    <>
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="body-text font-medium">{obligation.title}</p>
          <span className="text-meta">{obligation.provider}</span>
        </div>
        <p className="text-small text-text-secondary">{obligation.detail}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
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
          className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] px-2 py-3 transition-colors duration-150 hover:bg-surface-subtle"
        >
          {body}
        </Link>
      ) : (
        <div className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-3">{body}</div>
      )}
      {obligation.payUrl && host && (
        <div className="flex flex-wrap items-center gap-2 pb-3">
          {/* The payment happens on the service's own site, in a new tab. */}
          <a
            href={obligation.payUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] text-accent-text transition-colors duration-150 hover:bg-accent-hover"
          >
            Pay on {host}
            <ExternalLink size={15} strokeWidth={1.75} />
          </a>
          {subscriptionId && (
            <Button
              size="sm"
              variant="ghost"
              disabled={markPaid.isPending}
              onClick={() => {
                setFailure(null);
                markPaid.mutate(subscriptionId, { onError: (err) => setFailure(err instanceof Error ? err.message : "Couldn't update it.") });
              }}
            >
              {markPaid.isPending ? "Saving…" : "I've paid"}
            </Button>
          )}
          {failure && (
            <span role="alert" className="text-[13px] text-danger">
              {failure}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
