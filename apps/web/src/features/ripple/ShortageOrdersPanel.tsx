// What the ripple engine found short, as one order per store with a
// "Call store" button: one tap approves it and the agent phones the store.
import { Link } from "@tanstack/react-router";
import { Phone, Store } from "lucide-react";
import { Button, Card, SectionHeader, StatusPill, type PillTone } from "@/components/ui/primitives";
import { useApproveAction, useShortageOrders } from "@/hooks/queries";
import type { ActionItem } from "@/mocks/types";

function callStatus(order: ActionItem): { label: string; tone: PillTone } {
  if (order.status === "proposed") return { label: "Ready to call", tone: "warning" };
  if (order.status === "confirmed") return { label: "Store confirmed", tone: "accent" };
  if (order.status === "failed") return { label: "Call failed", tone: "danger" };
  const state = order.execution?.state;
  return { label: state && state !== "Confirmed" ? `${state}…` : "Calling…", tone: "warning" };
}

export function ShortageOrdersPanel() {
  const query = useShortageOrders();
  const approve = useApproveAction();
  const data = query.data;
  if (!data || (data.orders.length === 0 && data.missingStore.length === 0)) return null;

  return (
    <section className="space-y-2" aria-label="Order what's missing">
      <SectionHeader>Order what's missing</SectionHeader>
      {data.orders.map((order) => {
        const status = callStatus(order);
        const calling = order.status === "approved" || order.status === "executing";
        const detail = order.execution?.detail;
        return (
          <Card key={order.id} className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="body-text font-medium">{order.vendor}</p>
                <p className="text-small text-text-secondary">{order.quantity}</p>
                <p className="text-meta">About {order.estimatedCost} · delivered to your home</p>
              </div>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </div>
            {order.status === "confirmed" && detail && <p className="text-small text-text-secondary">{detail}</p>}
            {order.status === "failed" && (
              <p className="text-small text-danger">The store didn't confirm. You can try again from Actions.</p>
            )}
            {order.status === "proposed" && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-meta">
                  {data.live ? "The agent will phone the store and place this order." : "Demo mode: the call is simulated."}
                </p>
                <Button
                  variant="primary"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(order.id, { onSettled: () => void query.refetch() })}
                >
                  <Phone size={16} strokeWidth={1.75} />
                  Call store
                </Button>
              </div>
            )}
            {calling && (
              <p role="status" className="text-meta">
                The agent is on the phone with {order.vendor}. This usually takes a minute.
              </p>
            )}
          </Card>
        );
      })}
      {data.missingStore.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="body-text font-medium">No store for {data.missingStore.map((m) => m.name).join(", ")}</p>
            <p className="text-meta">
              {data.storeCount === 0
                ? "Add the shops you buy from and the agent can call them."
                : "None of your stores sells these. Add one that does."}
            </p>
          </div>
          <Link to="/stores" className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-subtle px-5 text-[15px]">
            <Store size={16} strokeWidth={1.75} />
            Add a store
          </Link>
        </Card>
      )}
    </section>
  );
}
