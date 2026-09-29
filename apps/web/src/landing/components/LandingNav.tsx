import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu, X } from "lucide-react";

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

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-200 ${
        scrolled || open
          ? "border-b border-border bg-background/90 backdrop-blur-sm"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav
        aria-label="Landing"
        className="landing-container flex h-16 items-center justify-between"
      >
        <a href="#top" className="body-text font-semibold tracking-tight">
          Household Intelligence
        </a>
        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-small text-text-secondary transition-colors hover:text-text-primary"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/"
            className="inline-flex h-10 min-h-[44px] items-center gap-1.5 rounded-button bg-text-primary px-4 text-small font-medium text-white transition-colors hover:bg-black/80"
          >
            Enter app
            <ArrowRight size={16} strokeWidth={1.75} />
          </Link>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-11 items-center justify-center rounded-button text-text-primary md:hidden"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>
      {open && (
        <div className="border-t border-border bg-background px-5 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex min-h-[44px] items-center rounded-[6px] px-2 body-text hover:bg-surface-subtle"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/"
              className="mt-2 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-button bg-text-primary px-4 text-small font-medium text-white"
            >
              Enter app
              <ArrowRight size={16} strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
