import { useState } from "react";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Segmented } from "@/components/ui/livora";
import { usePlans } from "@/hooks/life";
import type { Plans } from "@/lib/lifeApi";
import { rupees } from "@household/life";

export function PlansPage() {
  const query = usePlans();
  return <QueryBoundary query={query}>{(plans) => <PlansView plans={plans} />}</QueryBoundary>;
}

function PlansView({ plans }: { plans: Plans }) {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("yearly");
  const price = cycle === "monthly" ? plans.monthly : Math.round(plans.yearly / 12);

  return (
    <div className="mx-auto max-w-[920px]">
      <PageHeader
        eyebrow="Plans"
        title="Free to start"
        subtitle="Essentials stay free. Premium adds deeper planning and household sharing."
        action={
          <Segmented
            label="Billing cycle"
            value={cycle}
            onChange={setCycle}
            options={[
              { id: "monthly", label: "Monthly" },
              { id: "yearly", label: "Yearly" },
            ]}
          />
        }
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="card-base p-6" aria-label="Free plan">
          <p className="mono-label">Free</p>
          <p className="mt-2 text-[56px] leading-none tracking-[-0.05em]">{rupees(0)}</p>
          <ul className="mt-6 space-y-3">
            {plans.free.map((f) => (
              <li key={f} className="flex gap-3 text-[16px]">
                <Check size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
                {f}
              </li>
            ))}
          </ul>
        </section>
        <section className="panel-dark p-6" aria-label="Premium plan">
          <p className="mono-label !text-panel-muted">Premium</p>
          <p className="mt-2 text-[56px] leading-none tracking-[-0.05em]">
            {rupees(price)}
            <span className="ml-1 text-[18px] text-panel-muted">/mo</span>
          </p>
          {cycle === "yearly" && <p className="mt-1 text-[14px] text-panel-muted">Billed {rupees(plans.yearly)} yearly</p>}
          <ul className="mt-6 space-y-3">
            {plans.premium.map((f) => (
              <li key={f} className="flex gap-3 text-[16px]">
                <Check size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#9FD08A]" />
                {f}
              </li>
            ))}
          </ul>
          <button type="button" disabled className="mt-8 h-12 w-full cursor-not-allowed rounded-full bg-white/15 text-[15px] text-panel-muted">
            Checkout not connected
          </button>
        </section>
      </div>
      <div className="card-base mt-3 space-y-2 p-6">
        <h2 className="text-[20px] tracking-[-0.03em]">Our promise on recommendations</h2>
        <p className="text-[15px] text-text-secondary">
          Sponsored suggestions are always labelled and never ranked above what you actually need. Referral partners
          (grocery, rentals, EV charging) can appear, but only when they match your request.
        </p>
        <p className="mono-label">Prices are placeholders. No payment provider is connected.</p>
      </div>
    </div>
  );
}
