import type {
  SpeechEndHint,
  SpeechStartHint,
  TranscriptionProvider,
  TranscriptionStream
} from "../../types";

export interface MockTranscriptionProviderOptions {
  transcript?: string;
}

export class MockTranscriptionProvider
  implements TranscriptionProvider
{
  private lastSpeechEndCallback: ((hint?: SpeechEndHint) => void) | null = null;
  private lastSpeechStartCallback: ((hint?: SpeechStartHint) => void) | null = null;

  constructor(private options: MockTranscriptionProviderOptions = {}) {}

  async createStream({
    onTranscript,
    onSpeechEnd,
    onSpeechStart
  }: Parameters<TranscriptionProvider["createStream"]>[0]): Promise<TranscriptionStream> {
    let aborted = false;
    let buffer: ArrayBuffer[] = [];
    this.lastSpeechEndCallback = onSpeechEnd ?? null;
    this.lastSpeechStartCallback = onSpeechStart ?? null;

    return {
      send: (chunk) => {
        if (chunk instanceof ArrayBuffer) {
          buffer.push(chunk);
          return;
        }
        const view = chunk as ArrayBufferView;
        const copied = new ArrayBuffer(view.byteLength);
        new Uint8Array(copied).set(
          new Uint8Array(
            view.buffer,
            view.byteOffset,
            view.byteLength
          )
        );
        buffer.push(copied);
      },
      finish: async () => {
        if (aborted) return;
        const defaultTranscript =
          this.options.transcript ??
          `mock transcript (${buffer.length} chunks)`;
        onTranscript({
          transcript: defaultTranscript,
          isFinal: true
        });
      },
      abort: () => {
        aborted = true;
        buffer = [];
      }
    };
  }

  triggerSpeechEnd(hint?: SpeechEndHint) {
    this.lastSpeechEndCallback?.(hint);
  }

  triggerSpeechStart(hint?: SpeechStartHint) {
    this.lastSpeechStartCallback?.(hint);
  }
}
