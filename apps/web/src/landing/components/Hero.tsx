import { ArrowDown } from "lucide-react";

export function Hero() {
  return (
    <section aria-labelledby="hero-h" className="landing-container pb-16 pt-36 md:pb-24 md:pt-48">
      <p className="landing-eyebrow">Household Intelligence</p>
      <h1 id="hero-h" className="landing-display mt-6 max-w-3xl">
        Your household,
        <br />
        understood.
      </h1>
      <p className="landing-lede mt-6 max-w-xl">
        A system that notices what happens next.
      </p>
      <p className="mt-16 flex items-center gap-2 text-small text-text-tertiary md:mt-24">
        <ArrowDown size={16} strokeWidth={1.75} aria-hidden />
        Scroll
      </p>
    </section>
  );
}
