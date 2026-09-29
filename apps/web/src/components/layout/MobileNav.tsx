import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ChefHat,
  ClipboardList,
  Home,
  Mic,
  PencilLine,
  Plus,
  ScanLine,
  UtensilsCrossed,
  X,
} from "lucide-react";

const tabs = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/inventory", label: "Kitchen", icon: ChefHat, exact: false },
  { to: "/activity", label: "Activity", icon: Activity, exact: false },
  { to: "/settings", label: "You", icon: ClipboardList, exact: true },
] as const;

type Tab = (typeof tabs)[number];

export function MobileNav() {
  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="relative mx-auto grid max-w-md grid-cols-5 items-center px-2 pt-1">
        <TabLink tab={tabs[0]} />
        <TabLink tab={tabs[1]} />
        <AddButton />
        <TabLink tab={tabs[2]} />
        <TabLink tab={tabs[3]} />
      </div>
    </nav>
  );
}

function TabLink({ tab }: { tab: Tab | undefined }) {
  if (!tab) return <span aria-hidden />;
  const Icon = tab.icon;
  return (
    <Link
      to={tab.to}
      activeOptions={{ exact: tab.exact }}
      activeProps={{
        className:
          "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-[6px] py-1 text-meta text-accent",
      }}
      inactiveProps={{
        className:
          "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-[6px] py-1 text-meta text-text-tertiary",
      }}
    >
      <Icon size={20} strokeWidth={1.75} />
      {tab.label}
    </Link>
  );
}

function AddButton() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const actions = [
    { to: "/voice", label: "Speak", icon: Mic },
    { to: "/receipt", label: "Scan receipt", icon: ScanLine },
    { to: "/meals", label: "Plan meal", icon: UtensilsCrossed },
    { to: "/inventory", label: "Add manually", icon: PencilLine },
  ] as const;

  return (
    <>
      <button
        aria-label={open ? "Close add menu" : "Add"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-white shadow-none transition-transform duration-150 active:scale-95"
      >
        {open ? <X size={20} strokeWidth={2} /> : <Plus size={20} strokeWidth={2} />}
      </button>

      {open && (
        <>
          <button
            aria-label="Close add menu"
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            aria-label="Quick actions"
            className="fixed inset-x-0 bottom-16 z-50 mx-auto w-[calc(100%-32px)] max-w-sm overflow-hidden rounded-dialog border border-border bg-surface p-1.5"
          >
            {actions.map(({ to, label, icon: Icon }) => (
              <button
                key={label}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void navigate({ to });
                }}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-[6px] px-3 text-small text-text-primary transition-colors duration-150 hover:bg-surface-subtle"
              >
                <Icon size={18} strokeWidth={1.75} className="text-text-secondary" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
