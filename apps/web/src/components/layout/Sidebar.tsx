import { Link } from "@tanstack/react-router";
import {
  Activity,
  CalendarClock,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  Settings,
  TrendingDown,
  Users,
  UtensilsCrossed,
  Waves,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useMediaQuery";

const mainNav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/inventory", label: "Kitchen", icon: ChefHat, exact: false },
  { to: "/meals", label: "Meals", icon: UtensilsCrossed, exact: false },
  { to: "/ripple", label: "Ripple", icon: Waves, exact: false },
  { to: "/obligations", label: "Obligations", icon: CalendarClock, exact: false },
  { to: "/forecasts", label: "Forecasts", icon: TrendingDown, exact: false },
  { to: "/actions", label: "Actions", icon: ClipboardList, exact: false },
  { to: "/activity", label: "Activity", icon: Activity, exact: false },
] as const;

const secondaryNav = [
  { to: "/members", label: "Members", icon: Users, exact: true },
  { to: "/settings", label: "Settings", icon: Settings, exact: true },
] as const;

function NavItem({
  to,
  label,
  icon: Icon,
  exact,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof ChefHat;
  exact: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      activeProps={{
        className:
          "flex h-9 items-center gap-2.5 rounded-[6px] px-2.5 text-small transition-colors duration-150 bg-surface-subtle font-medium text-text-primary",
      }}
      inactiveProps={{
        className:
          "flex h-9 items-center gap-2.5 rounded-[6px] px-2.5 text-small transition-colors duration-150 text-text-secondary hover:bg-surface-subtle/60 hover:text-text-primary",
      }}
      onClick={onNavigate}
    >
      <Icon size={16} strokeWidth={1.75} />
      {label}
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-surface px-3 py-5">
      <div className="mb-6 px-2.5">
        <p className="eyebrow">Household</p>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {mainNav.map((item) => (
          <NavItem key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="my-4 border-t border-border" />
      <nav aria-label="Secondary" className="flex flex-col gap-0.5">
        {secondaryNav.map((item) => (
          <NavItem key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="mt-auto px-2.5">
        <p className="text-meta">Household Intelligence</p>
        <p className="text-meta">v0.1 · demo</p>
      </div>
    </aside>
  );
}

export function useSidebar() {
  return useIsMobile();
}
