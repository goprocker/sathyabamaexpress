// Live speech-to-text over the API's WebSocket (/api/voice/stream → Sarvam realtime).
// The microphone is also recorded as a normal clip, so if the live connection fails
// callers can fall back to the upload route with the same audio.
import { VoiceStreamServerMessageSchema } from "@household/contracts";
import { API_BASE } from "./api";
import { authEnabled, authHeaders } from "./auth";

export interface LiveTranscriptionResult {
  /** Everything recognised, finals first, then any unfinished partial. */
  text: string;
  /** The recorded clip, for the upload fallback. */
  audio: Blob | null;
  /** False when the live connection failed or never started. */
  live: boolean;
}

export interface LiveTranscription {
  stop: () => Promise<LiveTranscriptionResult>;
  cancel: () => void;
}

const TARGET_RATE = 16_000;
const STOP_TIMEOUT_MS = 5_000;
/** ~2 s of audio queued while the socket is still connecting. */
const MAX_PENDING_CHUNKS = 20;

// Downmixes the microphone to 16 kHz mono 16-bit PCM in 100 ms chunks.
const WORKLET_SOURCE = `
class Pcm16Downsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${TARGET_RATE};
    this.pos = 0; this.acc = 0; this.cnt = 0;
    this.out = new Int16Array(${TARGET_RATE / 10}); this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.cnt++; this.pos++;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const s = Math.max(-1, Math.min(1, this.acc / this.cnt));
        this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        this.acc = 0; this.cnt = 0;
        if (this.n === this.out.length) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(${TARGET_RATE / 10}); this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm16-downsampler", Pcm16Downsampler);
`;

async function streamUrl(languageCode: string): Promise<string> {
  const url = new URL(`${API_BASE}/voice/stream`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("language", languageCode);
  if (authEnabled) {
    // WebSocket upgrades cannot send headers, so the short-lived session token rides in the URL.
    const token = (await authHeaders()).Authorization?.slice("Bearer ".length);
    if (token) url.searchParams.set("token", token);
  }
  return url.toString();
}

export function liveTranscriptionSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof WebSocket !== "undefined" &&
    typeof AudioWorkletNode !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * Opens the microphone and starts streaming. `onText` receives the running
 * transcript as it changes. Rejects if the microphone cannot be opened.
 */
export async function startLiveTranscription(options: {
  languageCode: string;
  onText: (text: string) => void;
}): Promise<LiveTranscription> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  const finals = new Map<number, string>();
  let partial: { utterance: number; text: string } | null = null;
  const transcript = () => {
    const parts = [...finals.entries()].sort(([a], [b]) => a - b).map(([, t]) => t);
    if (partial && !finals.has(partial.utterance)) parts.push(partial.text);
    return parts.map((t) => t.trim()).filter(Boolean).join(" ");
  };

  // Backup recording for the upload fallback.
  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  if (typeof MediaRecorder !== "undefined") {
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();
  }

  let liveOk = true;
  let ended = false;
  let resolveEnded: () => void = () => {};
  const endedPromise = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });
  const markEnded = () => {
    ended = true;
    resolveEnded();
  };

  const pending: ArrayBuffer[] = [];
  let socket: WebSocket | null = null;
  try {
    socket = new WebSocket(await streamUrl(options.languageCode));
    socket.binaryType = "arraybuffer";
  } catch {
    liveOk = false;
    markEnded();
  }
  if (socket) {
    const ws = socket;
    ws.onopen = () => {
      for (const chunk of pending.splice(0)) ws.send(chunk);
    };
    ws.onmessage = (event) => {
      let parsed;
      try {
        parsed = VoiceStreamServerMessageSchema.safeParse(JSON.parse(String(event.data)));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const msg = parsed.data;
      if (msg.type === "partial") partial = { utterance: msg.utterance, text: msg.text };
      else if (msg.type === "final") finals.set(msg.utterance, msg.text);
      else if (msg.type === "error") liveOk = false;
      else if (msg.type === "end") markEnded();
      if (msg.type === "partial" || msg.type === "final") options.onText(transcript());
    };
    ws.onerror = () => {
      liveOk = false;
    };
    ws.onclose = markEnded;
  }

  let context: AudioContext | null = null;
  try {
    context = new AudioContext();
    const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await context.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    const node = new AudioWorkletNode(context, "pcm16-downsampler", { numberOfInputs: 1, numberOfOutputs: 0 });
    node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (!socket) return;
      if (socket.readyState === WebSocket.OPEN) socket.send(e.data);
      else if (socket.readyState === WebSocket.CONNECTING && pending.length < MAX_PENDING_CHUNKS) pending.push(e.data);
    };
    context.createMediaStreamSource(stream).connect(node);
  } catch {
    liveOk = false;
    socket?.close();
  }

  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    void context?.close().catch(() => {});
  };

  const stopRecorder = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      if (!recorder || recorder.state === "inactive") return resolve(chunks.length ? new Blob(chunks) : null);
      const rec = recorder;
      rec.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType || "audio/webm" }) : null);
      rec.stop();
    });

  return {
    stop: async () => {
      const audio = stopRecorder();
      release();
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" }));
      else if (socket?.readyState === WebSocket.CONNECTING) {
        liveOk = false;
        socket.close();
      }
      if (!ended) {
        await Promise.race([endedPromise, new Promise((r) => setTimeout(r, STOP_TIMEOUT_MS))]);
      }
      socket?.close();
      return { text: transcript(), audio: await audio, live: liveOk };
    },
    cancel: () => {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      release();
      socket?.close();
    },
  };
}
