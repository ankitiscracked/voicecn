import type { SpeechProvider } from "../../types";

export class MockSpeechProvider implements SpeechProvider {
  async stream(
    text: string,
    handlers: Parameters<SpeechProvider["stream"]>[1]
  ): Promise<void> {
    const encoder = new TextEncoder();
    const chunks = text.split(/\s+/);
    for (const chunk of chunks) {
      handlers.onAudioChunk(encoder.encode(chunk).buffer);
    }
    handlers.onClose();
  }
}
