// Actions / approvals (Design System §17) + Snapserve execution (§18)
// + Closed-loop Physical Delivery Verification & Discrepancy Reconciliation.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListSkeleton,
  SectionHeader,
  StatusPill,
  type PillTone,
} from "@/components/ui/primitives";
import {
  useActions,
  useApproveAction,
  useCompleteSnapserve,
  useRejectAction,
  useVerifyDelivery,
} from "@/hooks/queries";
import { snapserveProgress, subscribeToHouseholdEvents } from "@/lib/api";
import type { ActionItem, ActionStatus, SnapserveState } from "@/mocks/types";

const statusPill: Record<ActionStatus, { tone: PillTone; label: string }> = {
  proposed: { tone: "warning", label: "Needs review" },
  approved: { tone: "accent", label: "Approved" },
  executing: { tone: "accent", label: "Calling vendor" },
  confirmed: { tone: "accent", label: "Confirmed" },
  failed: { tone: "danger", label: "Failed" },
  rejected: { tone: "muted", label: "Rejected" },
};

const snapserveSteps: SnapserveState[] = [
  "Preparing",
  "Calling",
  "Connected",
  "Awaiting response",
  "Confirmed",
];

const backendStatusToSnapState: Record<string, SnapserveState> = {
  PREPARING: "Preparing",
  CALLING: "Calling",
  CONNECTED: "Connected",
  AWAITING_RESPONSE: "Awaiting response",
  CONFIRMED: "Confirmed",
  FAILED: "Failed",
};

export function ActionsPage() {
  const { data, isPending, isError, refetch } = useActions();
  const approve = useApproveAction();
  const reject = useRejectAction();
  const complete = useCompleteSnapserve();
  const verifyDelivery = useVerifyDelivery();

  const [executingId, setExecutingId] = useState<string | null>(null);
  const [snapState, setSnapState] = useState<SnapserveState>("Preparing");
  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(
    null
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const unsub = subscribeToHouseholdEvents((eventType, payload) => {
      if (eventType === "SNAPSERVE_CALL_PROGRESS") {
        const rawStatus = String(payload.status || "");
        const mapped = backendStatusToSnapState[rawStatus];
        if (mapped) {
          setSnapState(mapped);
        }
      } else if (
        eventType === "ACTION_RECONCILED" ||
        eventType === "DELIVERY_VERIFIED"
      ) {
        void refetch();
      }
    });
    return () => {
      unsub();
      timers.current.forEach(clearTimeout);
    };
  }, [refetch]);

  async function handleApprove(action: ActionItem) {
    setExecutingId(action.id);
    setSnapState("Preparing");
    const steps = await approve
      .mutateAsync(action.id)
      .catch(() => snapserveProgress(action));
    let last = 0;
    for (const step of steps) {
      last = step.afterMs;
      timers.current.push(
        setTimeout(() => setSnapState(step.state), step.afterMs)
      );
    }
    timers.current.push(
      setTimeout(() => {
        void complete.mutateAsync(action.id).finally(() => {
          setExecutingId(null);
          void refetch();
        });
      }, last + 500)
    );
  }

  async function handleVerifyDelivery(
    actionId: string,
    mode: "EXACT_MATCH" | "SHORT_DELIVERY"
  ) {
    const res = await verifyDelivery.mutateAsync({ actionId, mode });
    if (res.hasDiscrepancy) {
      setVerificationFeedback(
        "Discrepancy detected: physical delivery was 200 g short of confirmed order. Meal status updated and replacement action proposed above."
      );
    } else {
      setVerificationFeedback(
        "Physical delivery verified: all incoming items matched expected quantities and moved to On-Hand stock."
      );
    }
  }

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending || !data) return <ListSkeleton rows={4} />;

  const pending = data.filter((a) => a.status === "proposed");
  const handled = data.filter((a) => a.status !== "proposed");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Actions"
        subtitle="The system proposes; you decide — and verify physical outcomes."
      />

      {executingId && <ExecutionCard state={snapState} />}

      {verificationFeedback && (
        <div className="flex items-start justify-between gap-4 rounded-card border border-border bg-surface px-5 py-3.5">
          <p className="text-small text-text-primary">{verificationFeedback}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVerificationFeedback(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <SectionHeader>Needs review</SectionHeader>
        {pending.length === 0 ? (
          <EmptyState
            title="No actions waiting."
            hint="Proposed purchases and calls will appear here."
          />
        ) : (
          pending.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              onApprove={() => void handleApprove(action)}
              onReject={() => void reject.mutateAsync(action.id)}
              busy={approve.isPending || reject.isPending}
            />
          ))
        )}
      </section>

      {handled.length > 0 && (
        <section className="space-y-3">
          <SectionHeader>Handled &amp; physical verification</SectionHeader>
          <div className="divide-y divide-border rounded-card border border-border bg-surface px-5">
            {handled.map((action) => {
              const p = statusPill[action.status];
              const awaitingVerifications = (action.expectations ?? []).filter(
                (e) => e.status === "AWAITING_DELIVERY"
              );
              const discrepancies = (action.expectations ?? []).filter(
                (e) => e.status === "DISCREPANCY_DETECTED"
              );
              const verifiedMatches = (action.expectations ?? []).filter(
                (e) => e.status === "VERIFIED_MATCH"
              );
              const canVerify =
                action.status === "confirmed" &&
                (awaitingVerifications.length > 0 ||
                  (action.expectations ?? []).length === 0);

              return (
                <div key={action.id} className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-small font-medium">
                        {action.title} · {action.quantity}
                      </p>
                      <p className="text-meta">
                        {action.vendor} · {action.estimatedCost}
                        {action.execution?.detail
                          ? ` · ${action.execution.detail}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {discrepancies.length > 0 && (
                        <StatusPill tone="danger">
                          Discrepancy ({discrepancies[0]?.discrepancyDisplay}{" "}
                          short)
                        </StatusPill>
                      )}
                      {verifiedMatches.length > 0 &&
                        discrepancies.length === 0 && (
                          <StatusPill tone="accent">
                            Physically verified
                          </StatusPill>
                        )}
                      <StatusPill tone={p.tone}>{p.label}</StatusPill>
                    </div>
                  </div>

                  {canVerify && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[6px] bg-surface-subtle px-3.5 py-2.5">
                      <div>
                        <p className="text-small font-medium text-text-primary">
                          Physical delivery verification (Expected:{" "}
                          {action.quantity})
                        </p>
                        <p className="text-meta">
                          Vendor promised delivery on call. Verify physical weight
                          received to reconcile Incoming → On-Hand stock.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={verifyDelivery.isPending}
                          onClick={() =>
                            void handleVerifyDelivery(action.id, "EXACT_MATCH")
                          }
                        >
                          <Check size={14} strokeWidth={1.75} />
                          Verify full delivery
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={verifyDelivery.isPending}
                          onClick={() =>
                            void handleVerifyDelivery(
                              action.id,
                              "SHORT_DELIVERY"
                            )
                          }
                        >
                          <AlertTriangle size={14} strokeWidth={1.75} />
                          Report short delivery (−200 g)
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function ActionCard({
  action,
  onApprove,
  onReject,
  busy,
}: {
  action: ActionItem;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="body-text font-medium">
            {action.title} · {action.quantity}
          </p>
          <p className="text-meta">
            {action.vendor} · {action.estimatedCost}
          </p>
        </div>
        <StatusPill tone={statusPill[action.status].tone}>
          {statusPill[action.status].label}
        </StatusPill>
      </div>

      <Divider />
      <div className="py-3">
        <p className="eyebrow">Why</p>
        <p className="mt-1 text-small text-text-secondary">{action.reason}</p>
        {action.evidence && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <EvidenceCell label="Required" value={action.evidence.required} />
            <EvidenceCell label="Available" value={action.evidence.available} />
            <EvidenceCell
              label="Short"
              value={action.evidence.deficit}
              highlight
            />
          </div>
        )}
      </div>

      <p className="text-meta">
        {action.kind === "purchase"
          ? `Approving issues a cryptographic HMAC token and dials ${action.vendor} via Snapserve for ${action.quantity}.`
          : `Approving authorizes ${action.vendor} to proceed — you'll see the outcome in Activity.`}
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onReject} disabled={busy}>
          <X size={15} strokeWidth={1.75} />
          Reject
        </Button>
        <Button variant="primary" onClick={onApprove} disabled={busy}>
          <Check size={15} strokeWidth={1.75} />
          Approve
        </Button>
      </div>
    </Card>
  );
}

function EvidenceCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[6px] px-3 py-2 ${
        highlight ? "bg-danger-subtle" : "bg-surface-subtle"
      }`}
    >
      <p className="text-meta">{label}</p>
      <p
        className={`text-small font-medium ${
          highlight ? "text-danger" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** Live Snapserve call status — mirrors backend states (§18). */
function ExecutionCard({ state }: { state: SnapserveState }) {
  const currentIndex = snapserveSteps.indexOf(state);
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="body-text font-medium">Calling vendor via Snapserve…</p>
        <StatusPill tone={state === "Confirmed" ? "accent" : "warning"}>
          {state}
        </StatusPill>
      </div>
      <ol className="mt-3 space-y-0" aria-label="Execution progress">
        {snapserveSteps.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={step} className="flex items-center gap-3">
              <span
                className={`size-1.5 rounded-full ${
                  done
                    ? "bg-accent"
                    : active
                      ? "bg-accent/50"
                      : "bg-border-strong"
                }`}
              />
              <span
                className={`py-1 text-small ${
                  done || active ? "text-text-primary" : "text-text-tertiary"
                }`}
              >
                {step}
              </span>
              {active && <span className="text-meta">in progress…</span>}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 flex items-center gap-1 text-meta">
        Status streamed from backend ExecutionEngine
        <ChevronRight size={12} strokeWidth={1.75} />
      </p>
    </Card>
  );
}
