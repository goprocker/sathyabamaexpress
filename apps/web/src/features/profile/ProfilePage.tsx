import {
  User,
  Crown,
  Bell,
  Shield,
  ChevronRight,
  Mic,
  Smartphone,
  LogOut,
  ChefHat,
  TrendingUp,
  Package,
} from "lucide-react";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { useKitchenSample, useMembers } from "@/hooks/life";
import { useInventory } from "@/hooks/queries";
import { useAccount } from "@/lib/auth";

function SettingRow({
  icon: Icon,
  label,
  detail,
  action,
}: {
  icon: typeof User;
  label: string;
  detail?: string;
  action?: string;
}) {
  return (
    <button className="flex items-center gap-3 w-full px-4 py-3.5 text-left rounded-[8px] hover:bg-[var(--color-surface-subtle)] transition-colors duration-[150ms] group">
      <div className="w-9 h-9 rounded-[8px] bg-[var(--color-surface-subtle)] flex items-center justify-center shrink-0 group-hover:bg-[var(--color-border-subtle)]">
        <Icon size={16} className="text-[var(--color-text-secondary)]" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{label}</p>
        {detail && <p className="text-[12px] text-[var(--color-text-tertiary)] mt-0.5">{detail}</p>}
      </div>
      {action ? (
        <span className="text-[12px] font-medium text-[var(--color-accent)]">{action}</span>
      ) : (
        <ChevronRight size={16} className="text-[var(--color-text-tertiary)] opacity-50 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

export function ProfilePage() {
  const sample = useKitchenSample();
  return <QueryBoundary query={sample}>{(data) => <ProfileView budgetData={data.budget} />}</QueryBoundary>;
}

function ProfileView({ budgetData }: { budgetData: { monthlyBudget: number; spent: number } }) {
  const familyMembers = useMembers().data ?? [];
  const totalItems = useInventory().data?.length ?? 0;
  const account = useAccount();
  // Signed-in users see their own identity; demo mode keeps the sample profile.
  const displayName = account.enabled ? account.name || account.email.split("@")[0] || "You" : "Priya Sharma";
  const displayEmail = account.enabled ? account.email : "priya.sharma@email.com";

  return (
    <div className="space-y-6 max-w-[600px]">
      {/* Profile Header */}
      <div className="card-base p-6 text-center fade-in-up stagger-1">
        <div className="w-20 h-20 rounded-full bg-[var(--color-accent)] flex items-center justify-center mx-auto mb-4">
          <span className="text-[28px] font-semibold text-white">{displayName.slice(0, 1).toUpperCase()}</span>
        </div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
          {displayName}
        </h1>
        <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">{displayEmail}</p>
        <div className="flex items-center justify-center gap-1.5 mt-3">
          <Crown size={14} className="text-[#F5A623]" />
          <span className="text-[12px] font-semibold text-[#F5A623]">Premium Plan</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 fade-in-up stagger-2">
        <div className="card-base p-4 text-center">
          <Package size={18} className="text-[var(--color-accent)] mx-auto mb-2" strokeWidth={1.75} />
          <p className="text-[20px] font-semibold tracking-[-0.02em]">{totalItems}</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">Pantry Items</p>
        </div>
        <div className="card-base p-4 text-center">
          <TrendingUp size={18} className="text-[var(--color-success)] mx-auto mb-2" strokeWidth={1.75} />
          <p className="text-[20px] font-semibold tracking-[-0.02em]">₹{(budgetData.monthlyBudget - budgetData.spent).toLocaleString()}</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">Saved/Month</p>
        </div>
        <div className="card-base p-4 text-center">
          <ChefHat size={18} className="text-[var(--color-warning)] mx-auto mb-2" strokeWidth={1.75} />
          <p className="text-[20px] font-semibold tracking-[-0.02em]">18</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">Meals Cooked</p>
        </div>
      </div>

      {/* Family */}
      <div className="card-base p-4 space-y-3 fade-in-up stagger-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Family Members</h2>
          <button className="text-[12px] font-medium text-[var(--color-accent)]">
            Invite
          </button>
        </div>
        <div className="space-y-1">
          {familyMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] hover:bg-[var(--color-surface-subtle)] transition-colors duration-[150ms]"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--color-accent-subtle)] flex items-center justify-center">
                <span className="text-[12px] font-medium text-[var(--color-accent)]">
                  {member.name.charAt(0)}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{member.name}</p>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">{member.lastActive}</p>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                member.role === "admin"
                  ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"
                  : "bg-[var(--color-surface-subtle)] text-[var(--color-text-tertiary)]"
              }`}>
                {member.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="card-base overflow-hidden fade-in-up stagger-4">
        <SettingRow icon={Bell} label="Notifications" detail="Push, email, SMS" />
        <SettingRow icon={Mic} label="Voice Settings" detail="Tamil (ta-IN)" />
        <SettingRow icon={Smartphone} label="Grocery Platforms" detail="Zepto, Blinkit connected" />
        <SettingRow icon={Shield} label="Privacy & Data" detail="Manage your data" />
      </div>

      {/* Subscription */}
      <div className="card-base p-5 space-y-3 fade-in-up stagger-5">
        <div className="flex items-center gap-2">
          <Crown size={16} className="text-[#F5A623]" />
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Premium Plan</h2>
        </div>
        <p className="text-[12px] text-[var(--color-text-secondary)]">
          Advanced AI scanning, personalized meal planning, consumption predictions, budget analytics, and family sharing.
        </p>
        <div className="flex items-center justify-between rounded-[8px] bg-[var(--color-surface-subtle)] px-4 py-3">
          <div>
            <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">₹199/month</p>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">Renews Oct 15, 2026</p>
          </div>
          <button className="text-[12px] font-medium text-[var(--color-accent)]">
            Manage
          </button>
        </div>
      </div>

      {/* Sign out */}
      {account.enabled && (
        <button
          type="button"
          onClick={() => void account.signOut()}
          className="flex items-center gap-2 px-4 py-3 w-full text-[14px] font-medium text-[var(--color-danger)] rounded-[8px] hover:bg-[var(--color-danger-bg)] transition-colors duration-[150ms]"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      )}
    </div>
  );
}
