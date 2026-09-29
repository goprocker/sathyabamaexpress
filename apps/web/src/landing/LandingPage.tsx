import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { LandingNav } from "./components/LandingNav";
import { Hero } from "./components/Hero";
import { ScrollStory } from "./components/ScrollStory";
import { RippleInteractive, RippleSignature } from "./components/Ripple";
import { AgenticWorkflow, Difference, ExecutionSection, VoiceAgent } from "./components/Workflow";
import { FinalCTA, ProductPreview } from "./components/Preview";
import "./landing.css";

gsap.registerPlugin(ScrollTrigger);

export function LandingPage() {
  useEffect(() => {
    document.title = "Household Intelligence — Your Household, Understood.";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "An intelligent household system that understands what you have, what you're planning, and what needs to happen next.",
      );
    }
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return (
    <div id="top" className="landing min-h-dvh">
      <a
        href="#story"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-button focus:bg-text-primary focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to story
      </a>
      <LandingNav />
      <main>
        <Hero />
        <div id="story">
          <ScrollStory />
        </div>
        <RippleSignature />
        <Difference />
        <RippleInteractive />
        <AgenticWorkflow />
        <VoiceAgent />
        <ExecutionSection />
        <ProductPreview />
        <FinalCTA />
      </main>
      <footer className="border-t border-border">
        <div className="landing-container flex flex-col gap-2 py-8 text-small text-text-tertiary md:flex-row md:items-center md:justify-between">
          <p>Household Intelligence · Quiet, intelligent, inevitable.</p>
          <p>Receipt → Inventory → Meal → Ripple → Action → Verified state.</p>
        </div>
      </footer>
    </div>
  );
}
