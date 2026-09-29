import { Link } from "@tanstack/react-router";
import { CalendarDays, ChefHat, FileCheck2, Home, Sparkles, type LucideIcon } from "lucide-react";

const tabs: Array<{ to: string; label: string; icon: LucideIcon; exact?: boolean; also?: string[] }> = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/timeline", label: "Timeline", icon: CalendarDays },
  { to: "/assistant", label: "Ask", icon: Sparkles },
  { to: "/kitchen", label: "Kitchen", icon: ChefHat },
  { to: "/obligations", label: "Admin", icon: FileCheck2 },
];

const base =
  "flex min-h-[52px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-full px-2.5 transition-all duration-[180ms]";

export function MobileNav() {
  return (
    <nav
      aria-label="Bottom navigation"
      className="glass fixed inset-x-4 bottom-4 z-50 flex items-center justify-around rounded-full p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {tabs.map(({ to, label, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact }}
          className={base}
          inactiveProps={{ className: `${base} text-text-secondary` }}
          activeProps={{
            className: `${base} bg-accent text-accent-text shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_14px_-6px_rgba(46,107,62,0.7)]`,
          }}
        >
          <Icon size={20} strokeWidth={1.5} />
          <span className="text-[10px] tracking-[0.01em]">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
