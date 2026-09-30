const DEFAULT_BASE_URL = "https://api.openai.com";

function resolveApiKey(explicit?: string): string {
  const key = explicit ?? process.env.HAL_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error("HAL_OPENAI_API_KEY is not configured.");
  return key;
}

export type HALVoiceOptions = {
  apiKey?: string;
  model?: string;
  voice?: string;
  instructions?: string;
};

const DEFAULT_INSTRUCTIONS =
  "Speak French with a low, deep, warm masculine register, calm, precise, measured, and neutral, like a sophisticated synthetic computer. " +
  "Use extremely smooth, seamless, fast connected French speech with natural liaison and continuous phrasing. Keep the flow uninterrupted from one word into the next, using only tiny natural breaths where absolutely necessary. Treat commas and punctuation as almost imperceptible transitions rather than pauses. Avoid sentence-break effects, dramatic endings, isolated word emphasis, and over-articulation. Maintain one continuous, relaxed vocal stream while preserving clear intelligibility and the low register. " +
  "Do not imitate or reproduce any specific actor's voice.";

export async function synthesizeHALSpeech(
  text: string,
  options: HALVoiceOptions = {},
): Promise<Uint8Array> {
  const cleanText = text.trim().replace(/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/gu, "").replace(/\\s{2,}/g, " ").trim();
  if (!cleanText) throw new Error("HAL speech text cannot be empty.");

  const apiKey = resolveApiKey(options.apiKey);
  const response = await fetch(
    `${DEFAULT_BASE_URL}/v1/audio/speech`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model ?? "gpt-4o-mini-tts",
        voice: options.voice ?? "onyx",
        input: cleanText.slice(0, 4096),
        instructions: options.instructions ?? DEFAULT_INSTRUCTIONS,
        response_format: "mp3",\n        speed: 1.0,
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI speech synthesis failed (${response.status}): ${detail}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
