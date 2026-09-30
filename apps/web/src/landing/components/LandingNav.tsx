import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { authEnabled } from "@/lib/auth";
import { LivoraMark } from "@/components/layout/LivoraMark";
import { ArrowRight, MoreVertical, X } from "lucide-react";

const links = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how" },
  { label: "Technology", href: "#technology" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 md:px-5 md:pt-5">
      <div
        className={`glass mx-auto max-w-[1200px] rounded-[32px] transition-shadow duration-200 ${
          scrolled || open ? "shadow-lg" : ""
        }`}
      >
        <nav aria-label="Landing" className="flex h-16 items-center justify-between px-4 md:px-5">
          <a href="#top" className="flex items-center gap-2 text-text-primary">
            <LivoraMark size={34} />
            <span className="text-[21px] font-semibold leading-none tracking-[-0.04em] text-[#1F4A2E]">
              Livora
              <sup className="ml-0.5 align-super text-[10px] font-semibold tracking-normal text-gold">AI</sup>
            </span>
          </a>
          <div className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="flex h-10 items-center rounded-full px-4 text-[15px] transition-colors duration-[180ms] hover:bg-surface-elevated"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/"
              className="ml-2 btn-primary !min-h-0 h-10 !rounded-full !px-4"
            >
              {authEnabled ? "Sign in" : "Enter app"}
              <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-11 items-center justify-center rounded-full text-text-primary hover:bg-surface-elevated md:hidden"
          >
            {open ? <X size={20} /> : <MoreVertical size={20} />}
          </button>
        </nav>
        {open && (
          <div
            className="border-t border-border px-4 pb-4 pt-3 md:hidden"
            style={{ animation: "menuIn 220ms var(--ease-out) both" }}
          >
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[48px] items-center rounded-[12px] px-3 text-[18px] tracking-[-0.02em] hover:bg-surface-elevated"
                >
                  {l.label}
                </a>
              ))}
              <Link
                to="/"
                className="mt-2 inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-[16px] text-accent-text"
              >
                {authEnabled ? "Sign in" : "Enter app"}
                <ArrowRight size={16} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
