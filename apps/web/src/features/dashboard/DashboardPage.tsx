import { Link } from "@tanstack/react-router";
import { ArrowRight, AlertTriangle, Clock, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Divider,
  ErrorState,
  ListSkeleton,
  SectionHeader,
  StatusPill,
} from "@/components/ui/primitives";
import {
  useDashboard,
  useInventory,
  useObligations,
  useResetDemoState,
  useStateDiff,
} from "@/hooks/queries";
import { isExpiringSoon, relativeDay } from "@/lib/format";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function attentionTo(
  href: string,
): "/inventory" | "/meals" | "/receipt" | "/ripple" | "/actions" | "/obligations" | "/forecasts" | "/" {
  if (href.startsWith("/inventory")) return "/inventory";
  if (
    href === "/meals" ||
    href === "/receipt" ||
    href === "/ripple" ||
    href === "/actions" ||
    href === "/obligations" ||
    href === "/forecasts"
  )
    return href;
  return "/ripple";
}

export function DashboardPage() {
  const dash = useDashboard();
  const inv = useInventory();
  const stateDiff = useStateDiff();
  const resetDemo = useResetDemoState();

  if (dash.isError) {
    return <ErrorState onRetry={() => void dash.refetch()} />;
  }

  const d = dash.data;
  const items = inv.data ?? [];
  const totalItems = d?.inventorySummary?.totalItems ?? items.length;
  const lowStockCount =
    d?.inventorySummary?.lowStockCount ??
    items.filter((i) => i.quantity <= i.lowThreshold).length;
  const expiringSoonCount =
    d?.inventorySummary?.expiringSoonCount ??
    items.filter((i) => isExpiringSoon(i.expiry)).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greeting()}`}
        subtitle="Here's where your household state stands."
        action={
          <div className="flex items-center gap-2">
            {stateDiff.data && (
              <StatusPill tone="neutral">
                State v{stateDiff.data.stateVersion}
              </StatusPill>
            )}
            <button
              type="button"
              onClick={() => resetDemo.mutate()}
              disabled={resetDemo.isPending}
              title="Reset canonical demo state"
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-button border border-border bg-surface px-2.5 text-meta text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-text-primary disabled:opacity-50"
            >
              <RotateCcw size={12} strokeWidth={1.75} />
              Reset state
            </button>
          </div>
        }
      />

      {/* TODAY */}
      <section aria-labelledby="today-h" className="space-y-2">
        <SectionHeader>
          <span id="today-h">Next planned meal</span>
        </SectionHeader>
        {dash.isPending ? (
          <ListSkeleton rows={1} />
        ) : d?.todayMeal ? (
          <Link
            to="/meals"
            className="group -mx-2 flex items-center justify-between gap-4 rounded-[6px] px-2 py-3 transition-colors duration-150 hover:bg-surface-subtle"
          >
            <div>
              <p className="body-text font-medium">
                {d.todayMeal.recipeName} · {d.todayMeal.servings} people
              </p>
              <p className="text-small text-text-secondary">
                {d.todayMeal.shortCount > 0
                  ? `${d.todayMeal.shortCount} ingredients short`
                  : "All ingredients available or incoming"}
              </p>
            </div>
            <span className="flex items-center gap-1 text-small text-accent">
              Review
              <ArrowRight
                size={16}
                strokeWidth={1.75}
                className="transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </span>
          </Link>
        ) : null}
      </section>

      <Divider />

      {/* KITCHEN */}
      <section aria-labelledby="kitchen-h" className="space-y-2">
        <SectionHeader
          action={
            <Link to="/inventory" className="text-small text-accent hover:underline">
              Open kitchen
            </Link>
          }
        >
          <span id="kitchen-h">Kitchen</span>
        </SectionHeader>
        {inv.isPending && dash.isPending ? (
          <ListSkeleton rows={3} />
        ) : (
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <p className="body-text">
              <span className="font-medium tabular-nums">{totalItems}</span>{" "}
              <span className="text-text-secondary">items</span>
            </p>
            <p className="body-text">
              <span className={`font-medium tabular-nums ${lowStockCount > 0 ? "text-warning" : ""}`}>
                {lowStockCount}
              </span>{" "}
              <span className="text-text-secondary">running low</span>
            </p>
            <p className="body-text">
              <span className={`font-medium tabular-nums ${expiringSoonCount > 0 ? "text-warning" : ""}`}>
                {expiringSoonCount}
              </span>{" "}
              <span className="text-text-secondary">expiring soon</span>
            </p>
          </div>
        )}
      </section>

      {/* HOUSEHOLD OBLIGATIONS — broader scope beyond kitchen */}
      <section aria-labelledby="obligations-h" className="space-y-2">
        <SectionHeader
          action={
            <Link to="/obligations" className="text-small text-accent hover:underline">
              All obligations
            </Link>
          }
        >
          <span id="obligations-h">Household obligations</span>
        </SectionHeader>
        <ObligationsStrip />
      </section>

      <Divider />

      {/* NEEDS YOUR ATTENTION */}
      <section aria-labelledby="attention-h" className="space-y-2">
        <SectionHeader>
          <span id="attention-h">Needs your attention</span>
        </SectionHeader>
        {dash.isPending ? (
          <ListSkeleton rows={2} />
        ) : d && d.attentionItems.length > 0 ? (
          <ul className="divide-y divide-border">
            {d.attentionItems.map((item) => (
              <li key={item.id}>
                <Link
                  to={attentionTo(item.href)}
                  className="group -mx-2 flex items-center justify-between gap-4 rounded-[6px] px-2 py-3 transition-colors duration-150 hover:bg-surface-subtle"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={16} strokeWidth={1.75} className="mt-1 text-warning" />
                    <div>
                      <p className="body-text font-medium">{item.title}</p>
                      <p className="text-small text-text-secondary">{item.description}</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-small text-accent">
                    Review
                    <ArrowRight
                      size={16}
                      strokeWidth={1.75}
                      className="transition-transform duration-150 group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-text-tertiary">Nothing needs attention right now.</p>
        )}
      </section>

      <Divider />

      {/* RECENT ACTIVITY */}
      <section aria-labelledby="activity-h" className="space-y-2">
        <SectionHeader
          action={
            <Link to="/activity" className="text-small text-accent hover:underline">
              All activity
            </Link>
          }
        >
          <span id="activity-h">Recent activity</span>
        </SectionHeader>
        {dash.isPending ? (
          <ListSkeleton rows={3} />
        ) : d ? (
          <ul className="space-y-2.5">
            {d.recentActivity.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3">
                <span className="flex w-12 shrink-0 items-center gap-1 text-meta">
                  <Clock size={11} strokeWidth={1.75} />
                  {e.time}
                </span>
                <span className="text-small font-medium">{e.title}</span>
                <span className="text-small text-text-tertiary">{e.description}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* quiet helper for demo: direct link to the signature flow */}
      <p className="pt-2 text-meta">
        Try the demo: say{" "}
        <Link to="/voice" className="text-accent hover:underline">
          “Naalaikku 6 perukku biryani pannanum”
        </Link>{" "}
        — or upload a{" "}
        <Link to="/receipt" className="text-accent hover:underline">
          grocery receipt
        </Link>
        .
      </p>

    </div>
  );
}

/** Quiet summary strip of non-kitchen obligations (PRD §14 scope). */
function ObligationsStrip() {
  const obligations = useObligations();

  if (obligations.isPending) {
    return <ListSkeleton rows={2} />;
  }
  if (obligations.isError || !obligations.data) {
    return (
      <p className="text-small text-text-tertiary">
        Obligations couldn't be loaded.
      </p>
    );
  }

  const data = obligations.data;
  const attention = data
    .filter(
      (o) =>
        o.status === "due_soon" ||
        o.status === "overdue" ||
        o.status === "action_proposed",
    )
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 3);

  if (attention.length === 0) {
    return (
      <p className="text-small text-text-tertiary">
        All documents, bills and renewals are on track.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {attention.map((o) => (
        <li key={o.id}>
          <Link
            to={o.linkedActionId ? "/actions" : "/obligations"}
            className="group -mx-2 flex items-center justify-between gap-4 rounded-[6px] px-2 py-3 transition-colors duration-150 hover:bg-surface-subtle"
          >
            <div>
              <p className="body-text font-medium">{o.title}</p>
              <p className="text-small text-text-secondary">
                {o.provider}
                {o.dueDate ? ` · due ${relativeDay(o.dueDate)}` : ""}
                {o.amount ? ` · ${o.amount}` : ""}
              </p>
            </div>
            <span className="flex items-center gap-1 text-small text-accent">
              Review
              <ArrowRight
                size={16}
                strokeWidth={1.75}
                className="transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
