// Forecasts (PRD §14, Design §10 optional #15) — predicted risks and
// recurring demand across kitchen and household domains.
import {
  AlertTriangle,
  CalendarClock,
  TrendingDown,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  ErrorState,
  ListSkeleton,
  StatusPill,
  type PillTone,
} from "@/components/ui/primitives";
import { useForecasts } from "@/hooks/queries";
import type { Forecast } from "@/mocks/types";

const typeMeta: Record<
  Forecast["type"],
  { label: string; icon: typeof AlertTriangle; tone: PillTone }
> = {
  SHORTAGE_RISK: { label: "Shortage", icon: AlertTriangle, tone: "danger" },
  EXPIRY_RISK: { label: "Expiry", icon: CalendarClock, tone: "warning" },
  WASTE_RISK: { label: "Waste", icon: AlertTriangle, tone: "warning" },
  RECURRING_DEMAND: { label: "Recurring", icon: TrendingDown, tone: "neutral" },
  COMPLIANCE_RISK: { label: "Compliance", icon: CalendarClock, tone: "warning" },
};

// The API can add risk types before the UI knows them; never crash the page over a label.
const unknownMeta = { label: "Risk", icon: AlertTriangle, tone: "neutral" as PillTone };

const severityTone: Record<Forecast["severity"], PillTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

export function ForecastsPage() {
  const { data, isPending, isError, refetch } = useForecasts();

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending) return <ListSkeleton rows={6} />;

  const sorted = [...data].sort((a, b) => a.horizonDays - b.horizonDays);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Forecasts"
        subtitle="What the system expects to happen next — and when."
      />

      <div className="space-y-3">
        {sorted.map((f) => {
          const meta = typeMeta[f.type] ?? unknownMeta;
          const Icon = meta.icon;
          return (
            <Card key={f.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    className={`mt-1 ${
                      f.severity === "high"
                        ? "text-danger"
                        : f.severity === "medium"
                          ? "text-warning"
                          : "text-text-tertiary"
                    }`}
                  />
                  <div>
                    <p className="body-text font-medium">{f.itemName}</p>
                    <p className="mt-0.5 text-small text-text-secondary">{f.detail}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                  <StatusPill tone={severityTone[f.severity]}>
                    {f.horizonDays}d
                  </StatusPill>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
