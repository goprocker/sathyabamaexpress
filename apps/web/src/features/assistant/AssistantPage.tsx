import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { ImagePlus, Mic, SendHorizontal, Sparkles, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAsk, useAskByVoice, useStarters } from "@/hooks/life";
import type { Answer } from "@/lib/lifeApi";

interface Turn {
  id: number;
  q: string;
  image?: string;
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

/** Downscale to keep the upload small (the API caps request size) while staying legible for receipts. */
function resizeImage(file: File, maxSide = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unreadable image"));
    };
    img.src = url;
  });
}

function canRecord(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function getRecognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AssistantPage() {
  const askMutation = useAsk();
  const voiceMutation = useAskByVoice();
  const starters = useStarters().data ?? [];
  const search = useSearch({ strict: false }) as { q?: string };
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  turnsRef.current = turns;
  const voiceSupported = typeof window !== "undefined" && (canRecord() || getRecognition() !== null);

  const history = () =>
    turnsRef.current.flatMap((t) => (t.a ? [{ q: t.q, a: [t.a.text, ...(t.a.bullets ?? [])].join(" ").slice(0, 1500) }] : []));

  const ask = (question: string, spoken = false, image?: string) => {
    const text = question.trim();
    if (!text) return;
    const id = ++idRef.current;
    const prior = history();
    setTurns((t) => [...t, { id, q: text, ...(image ? { image } : {}), a: null }]);
    const settle = (a: Answer) => {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, a } : x)));
      if (spoken) speak(a.text);
    };
    askMutation.mutate(
      { question: text, history: prior, ...(image ? { image } : {}) },
      {
        onSuccess: settle,
        onError: () => settle({ text: "I couldn't reach the assistant service. Please try again.", sources: [] }),
      },
    );
  };

  const askAudio = (audio: Blob) => {
    const id = ++idRef.current;
    const prior = history();
    setTurns((t) => [...t, { id, q: "Listening…", a: null }]);
    voiceMutation.mutate(
      { audio, history: prior },
      {
        onSuccess: ({ transcript, answer }) => {
          setTurns((t) => t.map((x) => (x.id === id ? { ...x, q: transcript, a: answer } : x)));
          speak(answer.text);
        },
        onError: () => {
          setTurns((t) => t.filter((x) => x.id !== id));
          setVoiceError("I couldn't hear that. Try again, or type your question.");
        },
      },
    );
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
    if (!input.trim() && !attachment) return;
    ask(input.trim() || "What is this, and what should I do about it?", false, attachment ?? undefined);
    setInput("");
    setAttachment(null);
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setVoiceError(null);
    try {
      setAttachment(await resizeImage(file));
    } catch {
      setVoiceError("I couldn't read that image. Try a JPG or PNG.");
    }
  };

  const listenWithBrowser = () => {
    const Ctor = getRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const heard = e.results[0]?.[0]?.transcript;
      if (heard) ask(heard, true);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const listen = async () => {
    setVoiceError(null);
    if (recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    if (!canRecord()) {
      listenWithBrowser();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        setListening(false);
        if (chunks.length) askAudio(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };
      recorderRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setVoiceError("Microphone access is blocked. Allow it in the browser to use voice.");
    }
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
            <div className="ml-auto w-fit max-w-[85%] space-y-2">
              {t.image && (
                <img src={t.image} alt="Attached by you" className="ml-auto max-h-56 rounded-[20px] object-cover" />
              )}
              <p className="ml-auto w-fit rounded-[28px] rounded-br-[10px] bg-accent px-5 py-3 text-[16px] text-accent-text">
                {t.q}
              </p>
            </div>
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
        {attachment && (
          <div className="glass mb-2 flex w-fit items-center gap-2 rounded-[20px] p-1.5">
            <img src={attachment} alt="Image to send" className="size-14 rounded-[14px] object-cover" />
            <button
              type="button"
              onClick={() => setAttachment(null)}
              aria-label="Remove image"
              className="flex size-11 items-center justify-center rounded-full hover:bg-surface-elevated"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void pickImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="glass flex items-center gap-2 rounded-full p-1.5 pl-5">
          <label htmlFor="assistant-input" className="sr-only">
            Message
          </label>
          <input
            id="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={attachment ? "Ask about this image…" : "What do I need to complete tomorrow?"}
            className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-text-tertiary"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach image"
            className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-surface-elevated"
          >
            <ImagePlus size={18} strokeWidth={1.6} />
          </button>
          {voiceSupported && (
            <button
              type="button"
              onClick={listen}
              aria-label={listening ? "Stop recording" : "Speak"}
              aria-pressed={listening}
              className={`flex size-11 items-center justify-center rounded-full transition-colors ${listening ? "bg-tint-coral text-white" : "hover:bg-surface-elevated"}`}
            >
              <Mic size={18} strokeWidth={1.6} />
            </button>
          )}
          <button type="submit" aria-label="Send" disabled={!input.trim() && !attachment} className="btn-primary !min-h-0 size-11 !rounded-full !p-0 disabled:opacity-40">
            <SendHorizontal size={17} strokeWidth={1.75} />
          </button>
        </div>
        <p className="mono-label mt-2 px-4" role={voiceError ? "alert" : undefined}>
          {voiceError ??
            (listening
              ? "Listening… tap the mic again to send."
              : "Answers use your timeline, pantry, bills, commute and wardrobe.")}
        </p>
      </form>
    </div>
  );
}
