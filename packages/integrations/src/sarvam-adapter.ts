import WebSocket from "ws";

export interface SarvamTranscriptionResult {
  rawTranscript: string;
  languageDetected: string;
  usedProvider: "sarvam" | "provided-transcript";
}

export async function transcribeAudioWithSarvam(options: {
  audioBuffer?: Buffer;
  mimeType?: string;
  languageCode?: string;
  transcriptOverride?: string;
}): Promise<SarvamTranscriptionResult> {
  if (options.transcriptOverride && options.transcriptOverride.trim()) {
    return {
      rawTranscript: options.transcriptOverride.trim(),
      languageDetected: options.languageCode || "ta-IN",
      usedProvider: "provided-transcript",
    };
  }

  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) throw new Error("SARVAM_API_KEY is required to transcribe audio.");
  if (!options.audioBuffer || options.audioBuffer.length === 0) {
    throw new Error("Audio data or a transcript is required.");
  }
  {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(options.audioBuffer)], {
        type: options.mimeType || "audio/wav",
      });
      const mime = options.mimeType || "audio/wav";
      const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : mime.includes("mpeg") ? "mp3" : "wav";
      formData.append("file", blob, `speech.${ext}`);
      formData.append("model", process.env.SARVAM_STT_MODEL || "saarika:v2");
      formData.append("language_code", options.languageCode || "ta-IN");

      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: {
          "api-subscription-key": apiKey,
        },
        body: formData,
      });

      if (!response.ok) throw new Error(`Sarvam transcription failed (${response.status}).`);
      const data = (await response.json()) as {
        transcript?: string;
        language_code?: string;
      };
      if (!data.transcript?.trim()) throw new Error("Sarvam returned an empty transcript.");
      return {
        rawTranscript: data.transcript,
        languageDetected: data.language_code || options.languageCode || "ta-IN",
        usedProvider: "sarvam",
      };
  }
}

// ── Live transcription (Sarvam realtime WebSocket, beta) ────────────────────

const SARVAM_REALTIME_URL = "wss://api.sarvam.ai/speech-to-text-realtime/ws";

export interface SarvamLiveHandlers {
  onReady?: () => void;
  onPartial: (utterance: number, text: string) => void;
  onFinal: (utterance: number, text: string, language?: string) => void;
  onError: (message: string) => void;
  /** Fires once, after Sarvam ends the session or the socket closes. */
  onClose: () => void;
}

export interface SarvamLiveSession {
  /** 16 kHz mono 16-bit little-endian PCM. */
  sendAudio: (pcm: Buffer) => void;
  /** Ask Sarvam to finalise what it has heard and end the session. */
  finish: () => void;
  close: () => void;
}

type SarvamRealtimeEvent =
  | { event: "session.begin" }
  | { event: "transcript.partial"; utterance_idx: number; text: string }
  | { event: "transcript.final"; utterance_idx: number; text: string; language?: string }
  | { event: "error"; message?: string; is_fatal?: boolean }
  | { event: "session.end" }
  | { event: string };

export function openSarvamLiveTranscription(
  options: { languageCode?: string },
  handlers: SarvamLiveHandlers,
): SarvamLiveSession {
  const apiKey = process.env.SARVAM_API_KEY?.trim();
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    handlers.onClose();
  };

  if (!apiKey) {
    queueMicrotask(() => {
      handlers.onError("SARVAM_API_KEY is required for live transcription.");
      closeOnce();
    });
    return { sendAudio: () => {}, finish: () => {}, close: () => {} };
  }

  const params = new URLSearchParams({
    language_code: options.languageCode || "unknown",
    model: process.env.SARVAM_REALTIME_MODEL || "saaras:v3-realtime",
    sample_rate: "16000",
    encoding: "linear16",
  });
  const socket = new WebSocket(`${SARVAM_REALTIME_URL}?${params}`, {
    headers: { "api-subscription-key": apiKey },
  });
  // Audio that arrives before Sarvam accepts the connection.
  const pending: Buffer[] = [];
  let finishRequested = false;

  const send = (message: object) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const sendPcm = (pcm: Buffer) => send({ event: "audio_input", audio: pcm.toString("base64") });

  socket.on("open", () => {
    for (const chunk of pending.splice(0)) sendPcm(chunk);
    if (finishRequested) send({ event: "end" });
  });

  socket.on("message", (raw) => {
    let msg: SarvamRealtimeEvent;
    try {
      msg = JSON.parse(raw.toString()) as SarvamRealtimeEvent;
    } catch {
      return;
    }
    if (msg.event === "session.begin") handlers.onReady?.();
    else if (msg.event === "transcript.partial" && "text" in msg) handlers.onPartial(msg.utterance_idx, msg.text);
    else if (msg.event === "transcript.final" && "text" in msg) handlers.onFinal(msg.utterance_idx, msg.text, msg.language);
    else if (msg.event === "error") handlers.onError(("message" in msg && msg.message) || "Sarvam live transcription failed.");
    else if (msg.event === "session.end") socket.close(1000);
  });

  socket.on("unexpected-response", (_req, res) => {
    handlers.onError(`Sarvam live transcription rejected the connection (${res.statusCode}).`);
  });
  socket.on("error", (err) => handlers.onError(err.message || "Sarvam live transcription failed."));
  socket.on("close", (code, reason) => {
    if (code !== 1000 && code !== 1005 && !closed) {
      handlers.onError(`Sarvam live transcription closed (${code}${reason.length ? `: ${reason.toString()}` : ""}).`);
    }
    closeOnce();
  });

  return {
    sendAudio: (pcm) => {
      if (finishRequested || pcm.length === 0) return;
      if (socket.readyState === WebSocket.CONNECTING) pending.push(pcm);
      else sendPcm(pcm);
    },
    finish: () => {
      if (finishRequested) return;
      finishRequested = true;
      send({ event: "end" });
    },
    close: () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.terminate();
      closeOnce();
    },
  };
}
