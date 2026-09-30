// Inventory item detail (Design System §12 "Inventory item")
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  Divider,
  ErrorState,
  ListSkeleton,
  Row,
  SectionHeader,
  StatusPill,
} from "@/components/ui/primitives";
import { useInventoryItem } from "@/hooks/queries";
import { formatQuantity, isExpiringSoon, relativeDay } from "@/lib/format";

export function InventoryItemPage() {
  const { itemId } = useParams({ from: "/inventory/$itemId" });
  const { data, isPending, isError, refetch } = useInventoryItem(itemId);
  const navigate = useNavigate();

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending || !data) return <ListSkeleton rows={6} />;

  const daysLeft =
    data.dailyConsumption > 0 ? Math.floor(data.quantity / data.dailyConsumption) : null;

  const low = data.quantity <= data.lowThreshold;
  const reserved = data.reservedQuantity ?? 0;
  const incoming = data.incomingQuantity ?? 0;
  const effective = data.effectiveAvailableQuantity ?? Math.max(0, data.quantity - reserved + incoming);

  return (
    <div className="space-y-6">
      <button
        onClick={() => void navigate({ to: "/inventory" })}
        className="inline-flex cursor-pointer items-center gap-1.5 text-small text-text-secondary transition-colors duration-150 hover:text-text-primary"
      >
        <ArrowLeft size={14} strokeWidth={1.75} />
        Kitchen
      </button>

      <PageHeader
        title={data.name}
        subtitle={data.category}
        action={
          low ? <StatusPill tone="warning">Low stock</StatusPill> : <StatusPill tone="neutral">In stock</StatusPill>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-1">
          <SectionHeader>Canonical stock ledger</SectionHeader>
          <Card className="px-5 py-2">
            <Row
              label="On-hand quantity"
              value={formatQuantity(data.quantity, data.unit)}
            />
            <Divider />
            <Row
              label="Reserved (planned meals)"
              value={formatQuantity(reserved, data.unit)}
              tone={reserved > 0 ? "warning" : undefined}
            />
            <Divider />
            <Row
              label="Incoming (vendor order)"
              value={formatQuantity(incoming, data.unit)}
              tone={incoming > 0 ? "accent" : undefined}
            />
            <Divider />
            <Row
              label="Effective available"
              value={formatQuantity(effective, data.unit)}
            />
            <Divider />
            <Row
              label="Expected depletion"
              value={
                daysLeft != null
                  ? `~${daysLeft} day${daysLeft === 1 ? "" : "s"}`
                  : "—"
              }
            />
            <Divider />
            <Row
              label="Expiry"
              value={data.expiry ? relativeDay(data.expiry) : "—"}
              tone={isExpiringSoon(data.expiry) ? "warning" : undefined}
            />
          </Card>
        </section>

        <section className="space-y-1">
          <SectionHeader>Recent activity</SectionHeader>
          <Card className="px-5 py-2">
            {data.history.slice(0, 5).map((h, idx) => (
              <div key={idx}>
                {idx > 0 && <Divider />}
                <Row
                  label={h.label}
                  value={`${h.delta > 0 ? "+" : "−"}${formatQuantity(Math.abs(h.delta), data.unit)} · ${relativeDay(h.date)}`}
                  tone={h.delta > 0 ? "accent" : undefined}
                />
              </div>
            ))}
            {data.history.length === 0 && (
              <p className="py-4 text-small text-text-tertiary">
                No recorded movement yet.
              </p>
            )}
          </Card>
        </section>
      </div>

      <p className="text-meta">
        See how this item is affected by planned meals in the{" "}
        <Link to="/ripple" className="text-accent hover:underline">
          ripple view
        </Link>
        .
      </p>
    </div>
  );
}

