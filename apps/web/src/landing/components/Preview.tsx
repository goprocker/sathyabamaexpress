import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { BrowserFrame, Divider, SectionLabel, Stat } from "./ui";

export function ProductPreview() {
  return (
    <section id="product" aria-labelledby="preview-h" className="landing-container py-20 md:py-28">
      <SectionLabel>The product</SectionLabel>
      <h2 id="preview-h" className="landing-section-title mt-4 max-w-2xl">
        Calm on the surface.
        <br />
        Precise underneath.
      </h2>
      <div className="mt-12">
        <BrowserFrame url="household.app/overview">
          <p className="text-2xl font-semibold tracking-tight">Good morning</p>
          <div className="mt-6">
            <p className="landing-eyebrow">Today</p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div>
                <p className="body-text font-medium">Dinner · Biryani · 6 people</p>
                <p className="text-small text-text-secondary">2 ingredients short</p>
              </div>
              <span className="text-small text-accent">Review →</span>
            </div>
          </div>
          <div className="my-6"><Divider /></div>
          <div>
            <p className="landing-eyebrow">Kitchen</p>
            <div className="mt-2">
              <Stat label="Tracked items" value="42 items" />
              <Stat label="Running low" value="3" tone="warn" />
              <Stat label="Expiring soon" value="2" tone="warn" />
            </div>
          </div>
          <div className="my-6"><Divider /></div>
          <div>
            <p className="landing-eyebrow">Needs your attention</p>
            <p className="mt-2 body-text font-medium">Chicken · 800 g short</p>
            <p className="text-small text-text-secondary">Purchase proposed</p>
          </div>
          <div className="my-6"><Divider /></div>
          <div>
            <p className="landing-eyebrow">Recent activity</p>
            <ul className="mt-2 space-y-1.5 text-small text-text-secondary">
              <li>Meal planned</li>
              <li>Inventory updated</li>
              <li>Purchase proposed</li>
            </ul>
          </div>
        </BrowserFrame>
      </div>
    </section>
  );
}

export function FinalCTA() {
  return (
    <section aria-labelledby="cta-h" className="border-t border-border">
      <div className="landing-container py-24 text-center md:py-36">
        <h2 id="cta-h" className="landing-display mx-auto max-w-3xl">
          Your household,
          <br />
          understood.
        </h2>
        <p className="landing-lede mx-auto mt-6 max-w-md">
          The system is already there. We just made it visible.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-button bg-text-primary px-6 text-small font-medium text-white transition-colors hover:bg-black/80"
          >
            Explore the product
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
          </Link>
          <a
            href="#top"
            className="inline-flex min-h-[44px] items-center rounded-button border border-border-strong px-6 text-small font-medium hover:bg-surface-subtle"
          >
            Replay the story
          </a>
        </div>
        <p className="mt-16 text-small text-text-tertiary">
          Observe · Understand · Act
        </p>
      </div>
    </section>
  );
}
