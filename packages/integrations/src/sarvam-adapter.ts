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
      const blob = new Blob([options.audioBuffer], {
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
