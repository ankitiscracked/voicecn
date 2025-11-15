import type { TranscriptionProvider } from "@usevoiceai/server";
import {
  DeepgramTranscriptionProvider,
  type DeepgramProviderConfig,
} from "./deepgramTranscriptionProvider";

export type DeepgramOptions = Omit<DeepgramProviderConfig, "modelId"> & {
  modelId: string;
};

/**
 * Declarative helper that hides the Deepgram provider class behind a simple function.
 * Pair it with `createVoiceWebSocketSession({ transcription: deepgram({ ... }) })`.
 */
export function deepgram(
  modelId: string,
  options?: Omit<DeepgramProviderConfig, "modelId">
): TranscriptionProvider {
  if (!modelId) {
    throw new Error("Deepgram modelId is required");
  }
  return new DeepgramTranscriptionProvider({ modelId, ...options });
}
