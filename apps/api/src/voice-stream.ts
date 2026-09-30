// Live speech-to-text: the browser streams microphone PCM over a WebSocket and
// gets Sarvam's partial and final transcripts back as they are recognised.
// The Sarvam key stays here; the browser only ever talks to this route.
import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { RawData } from "ws";
import {
  VoiceStreamClientMessageSchema,
  type VoiceStreamServerMessage,
} from "@household/contracts";
import { openSarvamLiveTranscription } from "@household/integrations";
import { verifyRequestToken, type SessionVerifier } from "./auth.js";

/** One tap of the mic; longer sessions are finalised automatically. */
const MAX_SESSION_MS = 90_000;
/** How long to wait for Sarvam's last transcript after the user stops. */
const FINISH_GRACE_MS = 5_000;
const LANGUAGE_CODE = /^(unknown|[a-z]{2,3}-IN)$/;

const toBuffer = (data: RawData): Buffer =>
  Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);

export function registerVoiceStream(app: FastifyInstance, verifySession?: SessionVerifier) {
  app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  app.register(async (scope) => {
    scope.get(
      "/api/voice/stream",
      {
        websocket: true,
        // WebSocket upgrades cannot carry an Authorization header, so the session token rides in the query.
        preValidation: async (request, reply) => {
          if (!verifySession) return;
          const token = String((request.query as { token?: string }).token ?? "");
          const userId = token ? await verifyRequestToken(verifySession, token) : null;
          if (!userId) await reply.code(401).send({ error: "Sign in required." });
        },
      },
      (socket, request) => {
        const requested = String((request.query as { language?: string }).language ?? "");
        const languageCode = LANGUAGE_CODE.test(requested) ? requested : "unknown";

        const send = (message: VoiceStreamServerMessage) => {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
        };
        let failed = false;
        let finishTimer: ReturnType<typeof setTimeout> | undefined;

        const live = openSarvamLiveTranscription(
          { languageCode },
          {
            onReady: () => send({ type: "ready" }),
            onPartial: (utterance, text) => send({ type: "partial", utterance, text }),
            onFinal: (utterance, text, language) =>
              send({ type: "final", utterance, text, ...(language ? { language } : {}) }),
            onError: (message) => {
              request.log.warn({ message }, "voice stream: Sarvam error");
              if (failed) return;
              failed = true;
              send({ type: "error", message: "Live transcription is unavailable right now." });
            },
            onClose: () => {
              clearTimeout(sessionLimit);
              clearTimeout(finishTimer);
              send({ type: "end" });
              socket.close(1000);
            },
          },
        );

        const finish = () => {
          live.finish();
          finishTimer ??= setTimeout(() => live.close(), FINISH_GRACE_MS);
        };
        const sessionLimit = setTimeout(finish, MAX_SESSION_MS);

        socket.on("message", (data, isBinary) => {
          if (isBinary) {
            live.sendAudio(toBuffer(data));
            return;
          }
          try {
            if (VoiceStreamClientMessageSchema.parse(JSON.parse(toBuffer(data).toString())).type === "stop") finish();
          } catch {
            // Ignore malformed control frames.
          }
        });
        socket.on("close", () => {
          clearTimeout(sessionLimit);
          clearTimeout(finishTimer);
          live.close();
        });
      },
    );
  });
}
