import type { SpeechProvider } from "@usevoiceai/server";
import { CartesiaClient } from "@cartesia/cartesia-js";

const DEFAULT_VOICE_ID = "66c6b81c-ddb7-4892-bdd5-19b5a7be38e7";

type CartesiaStreamEvent =
  | { type: "chunk"; data?: string }
  | { type: "done" }
  | { type: "error"; error?: string }
  | { type: string; data?: string; error?: string };

export interface CartesiaSpeechConfig {
  apiKey?: string;
  modelId: string;
  voiceId?: string;
}

export class CartesiaSpeechProvider implements SpeechProvider {
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly voiceId: string;

  constructor(config: CartesiaSpeechConfig) {
    let apiKey = config.apiKey;

    if (!apiKey) {
      if (typeof process !== "undefined") {
        apiKey = process.env.CARTESIA_API_KEY ?? "";
      }
    }

    if (!apiKey) {
      throw new Error("CartesiaSpeechProvider requires an apiKey");
    }

    this.apiKey = apiKey;
    this.modelId = config.modelId;
    this.voiceId = config.voiceId ?? DEFAULT_VOICE_ID;
  }

  async stream(
    text: string,
    handlers: Parameters<SpeechProvider["stream"]>[1]
  ): Promise<void> {
    const normalized = text?.trim();
    if (!normalized) {
      handlers.onClose?.();
      return;
    }

    const client = new CartesiaClient({ apiKey: this.apiKey });
    let stream:
      | AsyncIterable<CartesiaStreamEvent>
      | AsyncIterator<CartesiaStreamEvent>
      | null = null;

    try {
      stream = (await client.tts.sse({
        modelId: this.modelId,
        transcript: normalized,
        voice: { mode: "id", id: this.voiceId },
        outputFormat: {
          container: "raw",
          encoding: "pcm_s16le",
          sampleRate: 48_000,
        },
      })) as AsyncIterable<CartesiaStreamEvent>;

      let completed = false;
      for await (const event of stream) {
        if (!event) continue;

        switch (event.type) {
          case "chunk":
            if (typeof event.data === "string" && event.data.length > 0) {
              handlers.onAudioChunk(base64ToArrayBuffer(event.data));
            }
            break;
          case "done":
            completed = true;
            break;
          case "error": {
            const message =
              typeof event.error === "string" && event.error.length > 0
                ? event.error
                : "Cartesia stream error";
            throw new Error(message);
          }
          default:
            break;
        }

        if (completed) {
          break;
        }
      }

      handlers.onClose?.();
    } catch (cause) {
      const error = normalizeCartesiaError(cause);
      handlers.onError?.(error);
      throw error;
    }
  }
}

function normalizeCartesiaError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  if (cause && typeof cause === "object" && "message" in (cause as any)) {
    return new Error(String((cause as { message: unknown }).message));
  }
  return new Error("Cartesia TTS stream error");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  const buffer = Buffer.from(base64, "base64");
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}
