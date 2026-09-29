import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { Mic, SendHorizontal, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAsk, useStarters } from "@/hooks/life";
import type { Answer } from "@/lib/lifeApi";

interface Turn {
  id: number;
  q: string;
  a: Answer | null;
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

function getRecognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AssistantPage() {
  const askMutation = useAsk();
  const starters = useStarters().data ?? [];
  const search = useSearch({ strict: false }) as { q?: string };
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);
  const voiceSupported = typeof window !== "undefined" && getRecognition() !== null;

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    const id = ++idRef.current;
    setTurns((t) => [...t, { id, q: text, a: null }]);
    const settle = (a: Answer) => setTurns((t) => t.map((x) => (x.id === id ? { ...x, a } : x)));
    askMutation.mutate(text, {
      onSuccess: settle,
      onError: () =>
        settle({ text: "I couldn't reach the assistant service. Please try again.", sources: [] }),
    });
  };

  useEffect(() => {
    if (search.q && !seeded.current) {
      seeded.current = true;
      ask(search.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.q]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
    setInput("");
  };

  const listen = () => {
    const Ctor = getRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const heard = e.results[0]?.[0]?.transcript;
      if (heard) ask(heard);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        eyebrow="Assistant"
        title="Ask about your life"
        subtitle="Answers come from your own timeline, pantry, spending, commute and wardrobe."
      />

      {turns.length === 0 && (
        <ul className="mb-6 grid gap-2 sm:grid-cols-2" aria-label="Suggested questions">
          {starters.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => ask(s)}
                className="card-interactive flex min-h-[72px] w-full items-center gap-3 p-4 text-left"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-subtle text-warning">
                  <Sparkles size={16} strokeWidth={1.5} />
                </span>
                <span className="text-[16px] leading-snug tracking-[-0.02em]">{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-5 pb-4" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} className="space-y-3">
            <p className="ml-auto w-fit max-w-[85%] rounded-[28px] rounded-br-[10px] bg-accent px-5 py-3 text-[16px] text-accent-text">
              {t.q}
            </p>
            {t.a ? (
              <div className="glass max-w-[92%] rounded-[28px] rounded-bl-[10px] p-5" style={{ animation: "fadeInUp 300ms var(--ease-out) both" }}>
                <p className="text-[19px] leading-snug tracking-[-0.02em]">{t.a.text}</p>
                {t.a.bullets && t.a.bullets.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {t.a.bullets.map((b) => (
                      <li key={b} className="flex gap-2.5 text-[15px] text-text-secondary">
                        <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-text-tertiary" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {t.a.sources.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="mono-label">Based on</span>
                    {t.a.sources.map((s) => (
                      <Link key={s.href + s.label} to={s.href} className="rounded-full bg-surface-elevated px-3 py-1 text-[13px] hover:bg-accent-subtle">
                        {s.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="glass w-fit rounded-full px-5 py-3 text-[15px] text-text-tertiary" role="status">
                Looking through your modules…
              </p>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="sticky bottom-24 md:bottom-6">
        <div className="glass flex items-center gap-2 rounded-full p-1.5 pl-5">
          <label htmlFor="assistant-input" className="sr-only">
            Message
          </label>
          <input
            id="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What do I need to complete tomorrow?"
            className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-text-tertiary"
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={listen}
              aria-label={listening ? "Listening" : "Speak"}
              aria-pressed={listening}
              className={`flex size-11 items-center justify-center rounded-full transition-colors ${listening ? "bg-tint-coral text-white" : "hover:bg-surface-elevated"}`}
            >
              <Mic size={18} strokeWidth={1.6} />
            </button>
          )}
          <button type="submit" aria-label="Send" disabled={!input.trim()} className="btn-primary !min-h-0 size-11 !rounded-full !p-0 disabled:opacity-40">
            <SendHorizontal size={17} strokeWidth={1.75} />
          </button>
        </div>
        <p className="mono-label mt-2 px-4">
          Rule-based answers over your local sample data. No language model is connected yet.
        </p>
      </form>
    </div>
  );
}
