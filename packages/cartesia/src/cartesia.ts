import type { SpeechProvider } from "@usevoice/server";
import {
  CartesiaSpeechProvider,
  type CartesiaSpeechConfig,
} from "./cartesiaSpeechProvider";

export type CartesiaOptions = Omit<CartesiaSpeechConfig, "apiKey"> & {
  apiKey?: string;
};

/**
 * Declarative helper that hides the Cartesia TTS streamer class behind a function.
 * Works seamlessly with `createVoiceWebSocketSession({ tts: cartesia({ ... }) })`.
 */
export function cartesia(
  modelId: string,
  options?: Omit<CartesiaOptions, "modelId">
): SpeechProvider {
  if (!modelId) {
    throw new Error("Cartesia modelId is required");
  }
  return new CartesiaSpeechProvider({ modelId, ...options });
}
