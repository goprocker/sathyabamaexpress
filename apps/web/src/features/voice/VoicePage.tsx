// Voice interaction (Design System §19) — a utility, not a chatbot.
// Connects to Sarvam STT → Intake Agent → Meal & Ripple Engines via /api/voice/transcribe.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, Square } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, StatusPill } from "@/components/ui/primitives";
import { transcribeVoice, type VoiceTranscriptionResult } from "@/lib/api";
import { voiceUtterance } from "@/mocks/data";

type Phase = "idle" | "listening" | "processing" | "result";

export function VoicePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<VoiceTranscriptionResult>({
    transcript: voiceUtterance.transcript,
    dish: voiceUtterance.event.dish,
    servings: voiceUtterance.event.servings,
    plannedDate: "Tomorrow",
  });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
  }, []);

  async function runVoicePipeline() {
    setPhase("processing");
    const response = await transcribeVoice();
    setResult(response);
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["actions"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["ripple"] });
    setPhase("result");
  }

  function start() {
    setPhase("listening");
    setSeconds(0);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    autoStopTimer.current = setTimeout(() => {
      if (timer.current) clearInterval(timer.current);
      void runVoicePipeline();
    }, 2000);
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
    void runVoicePipeline();
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
            <VoiceButton onClick={start} label="Start listening" />
            <p className="text-meta">e.g. “Naalaikku 6 perukku biryani pannanum.”</p>
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

        {phase === "result" && (
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

