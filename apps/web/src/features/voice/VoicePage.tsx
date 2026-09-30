// Voice interaction (Design System §19) — a utility, not a chatbot.
// Connects to Sarvam STT → Intake Agent → Meal & Ripple Engines via /api/voice/transcribe.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Square } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, StatusPill } from "@/components/ui/primitives";
import { transcribeVoice, type VoiceTranscriptionResult } from "@/lib/api";
import { authEnabled } from "@/lib/auth";
import { voiceUtterance } from "@/mocks/data";

type Phase = "idle" | "listening" | "processing" | "result" | "error";

const LANGUAGES = [
  { code: "ta-IN", label: "தமிழ்" },
  { code: "en-IN", label: "English" },
] as const;

export function VoicePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<VoiceTranscriptionResult>({
    transcript: voiceUtterance.transcript,
    dish: voiceUtterance.event.dish,
    servings: voiceUtterance.event.servings,
    plannedDate: "Tomorrow",
  });
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]["code"]>("ta-IN");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
  }, []);

  async function runVoicePipeline(input?: { audioBlob?: Blob; text?: string }) {
    setPhase("processing");
    setError(null);
    try {
      const response = await transcribeVoice(
        input?.audioBlob
          ? { audioBlob: input.audioBlob, languageCode: language }
          : input?.text
            ? { transcriptOverride: input.text, languageCode: language }
            : undefined,
      );
      setResult(response);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["actions"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      void queryClient.invalidateQueries({ queryKey: ["ripple"] });
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setPhase("error");
    }
  }

  async function start() {
    setError(null);
    // Signed out: the guided demo plays a sample sentence. Signed in: record for real.
    if (!authEnabled) {
      setPhase("listening");
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      autoStopTimer.current = setTimeout(() => {
        if (timer.current) clearInterval(timer.current);
        void runVoicePipeline();
      }, 2000);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        recorder.current = null;
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) void runVoicePipeline({ audioBlob: blob });
        else {
          setError("I didn't hear anything. Try again, or type it below.");
          setPhase("error");
        }
      };
      recorder.current = rec;
      rec.start();
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setPhase("listening");
    } catch {
      setError("Microphone access is blocked. Allow it in your browser, or type it below.");
      setPhase("error");
    }
  }

  function stop() {
    if (recorder.current) {
      recorder.current.stop();
      return;
    }
    if (timer.current) clearInterval(timer.current);
    if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
    void runVoicePipeline();
  }

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    void runVoicePipeline({ text });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Voice" subtitle="Speak naturally — mixed language is fine." />

      <div className="mx-auto max-w-md space-y-8 rounded-card border border-border bg-surface px-6 py-10 text-center">
        {phase === "idle" && (
          <>
            <p className="body-text text-text-secondary">
              Tap and say what you need.
            </p>
            <VoiceButton onClick={() => void start()} label="Start listening" />
            <p className="text-meta">e.g. “Naalaikku 6 perukku biryani pannanum.”</p>
            {authEnabled && (
              <div className="space-y-4 border-t border-border pt-6 text-left">
                <div role="group" aria-label="Language" className="flex justify-center gap-2">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      aria-pressed={language === l.code}
                      onClick={() => setLanguage(l.code)}
                      className={`min-h-[44px] rounded-full px-4 text-[14px] ${
                        language === l.code ? "bg-accent text-accent-text" : "bg-surface-subtle text-text-secondary"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <form onSubmit={submitTyped} className="flex gap-2">
                  <label htmlFor="voice-typed" className="sr-only">Or type your request</label>
                  <input
                    id="voice-typed"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="Or type it here"
                    className="h-11 min-w-0 flex-1 rounded-[8px] border border-border bg-surface px-3 text-[15px] outline-none focus:border-accent"
                  />
                  <Button type="submit" variant="secondary" disabled={!typed.trim()}>
                    Send
                  </Button>
                </form>
              </div>
            )}
          </>
        )}

        {phase === "listening" && (
          <>
            <p className="eyebrow">Listening</p>
            <p className="body-text text-text-secondary">Speak naturally…</p>
            <VoiceButton onClick={stop} label="Stop" active>
              <Square size={18} strokeWidth={1.75} />
            </VoiceButton>
            <p className="text-meta tabular-nums">{seconds}s</p>
          </>
        )}

        {phase === "processing" && (
          <>
            <p className="eyebrow">Transcribing</p>
            <div className="mx-auto mt-2 h-4 w-3/4 animate-pulse rounded bg-surface-subtle" />
            <p className="text-meta">Understanding the request…</p>
          </>
        )}

        {phase === "error" && (
          <>
            <p role="alert" className="body-text text-danger">
              {error}
            </p>
            <Button variant="secondary" onClick={() => setPhase("idle")}>
              Try again
            </Button>
          </>
        )}

        {phase === "result" && !result.dish && (
          <>
            <p className="italic body-text text-text-primary">“{result.transcript}”</p>
            <p className="text-meta">
              I heard you, but that wasn't a meal plan. Try something like “dinner tomorrow for 4”.
            </p>
            <Button variant="ghost" onClick={() => setPhase("idle")}>
              Again
              <Mic size={14} strokeWidth={1.75} />
            </Button>
          </>
        )}

        {phase === "result" && !!result.dish && (
          <>
            <p className="italic body-text text-text-primary">
              “{result.transcript}”
            </p>
            <div className="rounded-card border border-border bg-surface-subtle px-4 py-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-small font-medium">
                  {result.dish} · {result.servings} servings
                </span>
                <StatusPill tone="accent">{result.plannedDate}</StatusPill>
              </div>
              <p className="mt-1 text-meta">Inventory checked · ripple updated</p>
            </div>
            <div className="flex justify-center gap-2">
              <Button
                variant="primary"
                onClick={() =>
                  void navigate({ to: "/ripple" })
                }
              >
                View ripple
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void navigate({ to: "/meals" })
                }
              >
                Review meal
              </Button>
              <Button variant="ghost" onClick={() => setPhase("idle")}>
                Again
                <Mic size={14} strokeWidth={1.75} />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function VoiceButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`mx-auto flex size-16 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ${
        active ? "bg-danger text-white" : "bg-accent text-white hover:bg-accent/90"
      }`}
    >
      {children ?? <Mic size={22} strokeWidth={1.75} />}
    </button>
  );
}

