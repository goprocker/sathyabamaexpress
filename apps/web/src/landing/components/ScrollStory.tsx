import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface Chapter {
  at: number;
  kicker: string;
  line: string;
}

const CHAPTERS: Chapter[] = [
  { at: 0.0, kicker: "Observe", line: "It starts with something ordinary." },
  { at: 0.25, kicker: "Voice", line: "Tell it what you're planning." },
  { at: 0.42, kicker: "Understand", line: "It understands the consequences." },
  { at: 0.6, kicker: "Ripple", line: "One decision. Multiple consequences." },
  { at: 0.74, kicker: "Act", line: "Then it does something about it." },
  { at: 0.9, kicker: "Verify", line: "Not just reminders. Actual follow-through." },
];

function chapterFor(progress: number): number {
  let idx = 0;
  CHAPTERS.forEach((c, i) => {
    if (progress >= c.at) idx = i;
  });
  return idx;
}

export function ScrollStory() {
  const tallRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [chapter, setChapter] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const tall = tallRef.current;
    const video = videoRef.current;
    if (!tall || !video) return;

    let duration = 0;
    const onMeta = () => {
      duration = Number.isFinite(video.duration) ? video.duration : 0;
    };
    video.addEventListener("loadedmetadata", onMeta);
    onMeta();

    const seek = (progress: number) => {
      if (!duration) return;
      const t = progress * duration;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        try {
          const fast = video as HTMLVideoElement & {
            fastSeek?: (t: number) => void;
          };
          if (typeof fast.fastSeek === "function") fast.fastSeek(t);
          else video.currentTime = t;
        } catch {
          /* ignore seek errors before data loads */
        }
      });
    };

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: tall,
        start: "top top",
        end: "bottom bottom",
        scrub: 1,
        onUpdate: (self) => {
          seek(self.progress);
          setChapter(chapterFor(self.progress));
          if (barRef.current) {
            barRef.current.style.transform = `scaleX(${self.progress})`;
          }
        },
      });
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      video.removeEventListener("loadedmetadata", onMeta);
      ctx.revert();
    };
  }, [reduced]);

  if (reduced) {
    return (
      <section aria-label="How it works" className="landing-container py-16">
        <div className="overflow-hidden rounded-card border border-border">
          <video
            src="/landing/hero.mp4"
            poster="/landing/hero-poster.svg"
            muted
            playsInline
            preload="metadata"
            aria-label="Household story: receipt, kitchen, voice meal, ripple, vendor action"
            className="aspect-video w-full bg-surface-subtle object-cover"
          />
        </div>
        <ul className="mt-8 space-y-6">
          {CHAPTERS.map((c) => (
            <li key={c.kicker} className="border-l border-border-strong pl-4">
              <p className="landing-eyebrow">{c.kicker}</p>
              <p className="body-text mt-1">{c.line}</p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const active = CHAPTERS[chapter] ?? { at: 0, kicker: "Observe", line: "" };

  return (
    <section aria-label="Scroll story" className="story-tall" ref={tallRef}>
      <div className="story-sticky">
        {failed ? (
          <div className="flex h-full items-center justify-center bg-surface-subtle">
            <p className="body-text text-text-secondary">
              Video unavailable — the story continues below.
            </p>
          </div>
        ) : (
          <video
            ref={videoRef}
            src="/landing/hero.mp4"
            poster="/landing/hero-poster.svg"
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            onError={() => setFailed(true)}
            aria-label="Cinematic: grocery receipt becomes inventory, voice meal, ripple, vendor action"
            className="story-video"
          />
        )}
        <div className="story-scrim" aria-hidden />
        <div className="relative flex h-full items-end">
          <div className="landing-container pb-16 md:pb-24">
            <div
              key={active.kicker}
              className="story-copy max-w-xl"
              aria-live="polite"
            >
              <p className="text-small font-medium uppercase tracking-[0.08em] text-white/70">
                {active.kicker}
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                {active.line}
              </p>
            </div>
            <div className="mt-8 h-px w-full bg-white/25" aria-hidden>
              <div
                ref={barRef}
                className="story-progress h-px w-full bg-white"
                style={{ transform: "scaleX(0)" }}
              />
            </div>
            <p className="mt-3 text-small text-white/70 tabular-nums">
              {chapter + 1} / {CHAPTERS.length} · scroll to scrub the story
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
