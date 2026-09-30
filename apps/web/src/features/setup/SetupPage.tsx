// Setup: the one place a household tells Livora about itself. Family, identity
// and vehicle documents, vehicles (mileage, fuel, service), electricity bills and
// the local vendors it orders from. Everything computed here (progress, fuel left,
// reminders) comes from the API, never from this file.
import { useEffect, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { SETUP_STEP_IDS } from "@household/contracts";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { Segmented } from "@/components/ui/livora";
import { useProfile } from "@/hooks/profile";
import * as api from "@/lib/profileApi";
import type { ProfileView } from "@/lib/profileApi";
import { BillsTab } from "./BillsTab";
import { DocumentsTab } from "./DocumentsTab";
import { FamilyTab } from "./FamilyTab";
import { OverviewTab, type SetupTab } from "./OverviewTab";
import { VehiclesTab } from "./VehiclesTab";
import { VendorsTab } from "./VendorsTab";

const TABS: Array<{ id: SetupTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "family", label: "Family" },
  { id: "documents", label: "Documents" },
  { id: "vehicles", label: "Vehicles" },
  { id: "bills", label: "Bills" },
  { id: "vendors", label: "Vendors" },
];

const isTab = (value: unknown): value is SetupTab => value === "overview" || (SETUP_STEP_IDS as readonly unknown[]).includes(value);

export function SetupPage() {
  const profile = useProfile();
  return (
    <QueryBoundary query={profile} rows={4}>
      {(data) => <SetupView profile={data} />}
    </QueryBoundary>
  );
}

function SetupView({ profile }: { profile: ProfileView }) {
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const tab: SetupTab = isTab(search.tab) ? search.tab : "overview";
  const started = useRef(false);

  // Opening Setup once marks it as started, so Home stops steering you back here.
  useEffect(() => {
    if (!profile.startedAt && !started.current) {
      started.current = true;
      void api.startSetup().catch(() => undefined);
    }
  }, [profile.startedAt]);

  const open = (next: SetupTab) => {
    void navigate({ to: "/onboarding", search: { tab: next === "overview" ? undefined : next } });
    window.scrollTo({ top: 0 });
  };

  const { percent } = profile.progress;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Setup"
        title="Set up your household"
        subtitle={percent === 100 ? "You're all set. Come back any time to update things." : "Tell Livora about your family, documents, vehicles, bills and vendors so it can remind you at the right time."}
      />

      <div className="-mt-4">
        <Segmented<SetupTab> label="Setup sections" value={tab} onChange={open} options={TABS} />
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label} className="max-w-[860px]">
        {tab === "overview" && <OverviewTab profile={profile} onOpen={open} />}
        {tab === "family" && <FamilyTab profile={profile} />}
        {tab === "documents" && <DocumentsTab profile={profile} />}
        {tab === "vehicles" && <VehiclesTab profile={profile} />}
        {tab === "bills" && <BillsTab profile={profile} />}
        {tab === "vendors" && <VendorsTab profile={profile} />}
      </div>
    </div>
  );
}
