import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut, MoreVertical, Search, Sparkles, X } from "lucide-react";
import { LivoraMark } from "./LivoraMark";
import { SearchOverlay } from "./SearchOverlay";
import { isNavActive, navGroups, primaryNav } from "./nav";
import { useNotifications } from "@/hooks/life";
import { AccountButton } from "@/components/auth/AccountButton";
import { useAccount } from "@/lib/auth";
import { useActiveProfile } from "@/lib/profile";
import { MODULES } from "@/lib/modules";

const groupTint: Record<string, string> = {
  Intelligence: "bg-gold-subtle text-warning",
  "SmartKitchen AI": MODULES.kitchen.tint,
  "Life Administration": MODULES.admin.tint,
  "Mobility and Circular": MODULES.mobility.tint,
  Account: "bg-surface-elevated text-text-secondary",
};

export function Wordmark() {
  return (
    <Link to="/" aria-label="LIVORA AI home" className="flex items-center gap-2.5">
      <LivoraMark size={34} />
      <span className="text-[21px] font-semibold leading-none tracking-[-0.04em] text-[#1F4A2E] max-[349px]:hidden">
        Livora
        <sup className="ml-0.5 align-super text-[10px] font-semibold tracking-normal text-gold">AI</sup>
      </span>
    </Link>
  );
}

const iconBtn =
  "relative flex size-11 items-center justify-center rounded-full text-text-primary transition-colors duration-[180ms] hover:bg-surface-elevated";

export function TopNav() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const wrapRef = useRef<HTMLElement>(null);
  const unread = useNotifications().data?.unread ?? 0;
  const { active, members, setActive } = useActiveProfile();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <>
      <header ref={wrapRef} className="fixed inset-x-0 top-0 z-50 px-4 pt-4 md:px-5 md:pt-5">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6 focus:z-[60] focus:rounded-[12px] focus:bg-accent focus:px-3.5 focus:py-2.5 focus:text-accent-text"
        >
          Skip to content
        </a>
        <div className="glass mx-auto max-w-[1200px] rounded-[32px]">
          <div className="flex h-16 items-center justify-between gap-3 pl-5 pr-2.5">
            <Wordmark />
            <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
              {primaryNav.map((item) => {
                const active = isNavActive(pathname, item);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-10 items-center rounded-full px-3.5 text-[14.5px] transition-all duration-[180ms] ${
                      active
                        ? "bg-accent text-accent-text shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_14px_-6px_rgba(46,107,62,0.7)]"
                        : "text-text-primary hover:bg-surface-elevated"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Search (Ctrl or Cmd + K)" className={iconBtn} onClick={() => setSearching(true)}>
                <Search size={19} strokeWidth={1.6} />
              </button>
              <Link to="/notifications" aria-label={`Notifications, ${unread} unread`} className={iconBtn}>
                <Bell size={19} strokeWidth={1.6} />
                {unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-tint-coral px-1 text-[10px] leading-[18px] text-white">
                    {unread}
                  </span>
                )}
              </Link>
              <Link
                to="/assistant"
                className="btn-primary hidden !min-h-0 h-10 !rounded-full !px-4 sm:inline-flex"
              >
                <Sparkles size={16} strokeWidth={1.75} />
                Ask
              </Link>
              <AccountButton className={iconBtn} />
              <button
                type="button"
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
                aria-controls="site-menu"
                onClick={() => setOpen((v) => !v)}
                className={iconBtn}
              >
                {open ? <X size={20} strokeWidth={1.75} /> : <MoreVertical size={20} strokeWidth={1.75} />}
              </button>
            </div>
          </div>

          {open && (
            <nav
              id="site-menu"
              aria-label="All sections"
              className="max-h-[calc(100dvh-7rem)] overflow-y-auto border-t border-border px-3 pb-3 pt-4"
              style={{ animation: "menuIn 220ms var(--ease-out) both" }}
            >
              <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
                {navGroups.map((group) => (
                  <div key={group.title} className={group.items.length > 6 ? "lg:col-span-2" : ""}>
                    <p className="mono-label mb-2 px-2">{group.title}</p>
                    <ul className={`space-y-0.5 ${group.items.length > 6 ? "sm:grid sm:grid-cols-2 sm:gap-x-4 sm:space-y-0" : ""}`}>
                      {group.items.map((item) => {
                        const active = isNavActive(pathname, item);
                        const Icon = item.icon;
                        return (
                          <li key={`${group.title}-${item.to}`}>
                            <Link
                              to={item.to}
                              aria-current={active ? "page" : undefined}
                              className={`flex min-h-[52px] items-center gap-3 rounded-[20px] px-2.5 py-2 transition-colors duration-[180ms] ${
                                active ? "bg-surface-elevated" : "hover:bg-surface-elevated"
                              }`}
                            >
                              <span
                                className={`flex size-9 shrink-0 items-center justify-center rounded-[12px] ${groupTint[group.title] ?? ""}`}
                              >
                                <Icon size={18} strokeWidth={1.5} />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[16px] leading-tight tracking-[-0.02em]">{item.label}</span>
                                <span className="block truncate text-[13px] text-text-tertiary">{item.hint}</span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2 rounded-[24px] bg-surface-subtle p-2 pl-4">
                <span className="mono-label">Household profile</span>
                <div role="radiogroup" aria-label="Active profile" className="ml-auto flex flex-wrap gap-1">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={active?.id === m.id}
                      onClick={() => setActive(m.id)}
                      className={`flex min-h-[40px] items-center gap-2 rounded-full px-3 text-[14px] transition-colors duration-[180ms] ${
                        active?.id === m.id ? "bg-accent text-accent-text" : "hover:bg-surface-elevated"
                      }`}
                    >
                      <span className="flex size-6 items-center justify-center rounded-full bg-white/70 text-[12px] text-text-primary">
                        {m.name.slice(0, 1)}
                      </span>
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              {account.enabled && (
                <div className="mt-2 flex items-center gap-3 rounded-[24px] bg-surface-subtle p-2 pl-4">
                  <span className="mono-label">Signed in</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-text-secondary">{account.email}</span>
                  <button
                    type="button"
                    onClick={() => void account.signOut()}
                    className="flex min-h-[40px] items-center gap-2 rounded-full px-3 text-[14px] hover:bg-surface-elevated"
                  >
                    <LogOut size={16} strokeWidth={1.6} />
                    Sign out
                  </button>
                </div>
              )}
            </nav>
          )}
        </div>
      </header>
      <SearchOverlay open={searching} onClose={() => setSearching(false)} />
    </>
  );
}
