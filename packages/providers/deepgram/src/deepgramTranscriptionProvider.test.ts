import { describe, expect, it, vi } from "vitest";
import { LiveTranscriptionEvents } from "@deepgram/sdk";
import { DeepgramTranscriptionProvider } from "./deepgramTranscriptionProvider";

class FakeDeepgramStream {
  handlers = new Map<string, Array<(payload?: any) => void>>();
  send = vi.fn();
  keepAlive = vi.fn();
  finalize = vi.fn();
  requestClose = vi.fn();

  on(event: string, handler: (payload?: any) => void) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  emit(event: string, payload?: any) {
    this.handlers.get(event)?.forEach((handler) => handler(payload));
  }
}

describe("DeepgramTranscriptionProvider", () => {
  it("throws without api key", () => {
    expect(
      () =>
        new DeepgramTranscriptionProvider({ apiKey: "", modelId: "nova-3" })
    ).toThrow();
  });

  it("forwards transcript events", async () => {
    const fakeStream = new FakeDeepgramStream();
    const listenLive = vi.fn(() => fakeStream);
    const provider = new DeepgramTranscriptionProvider({
      apiKey: "test",
      modelId: "nova-3",
      clientFactory: () =>
        ({
          listen: {
            live: listenLive,
          },
        }) as any,
    });

    const transcriptHandler = vi.fn();
    const stream = await provider.createStream({
      onTranscript: transcriptHandler,
      onError: vi.fn(),
    });

    fakeStream.emit(LiveTranscriptionEvents.Open);
    fakeStream.emit(LiveTranscriptionEvents.Transcript, {
      channel: { alternatives: [{ transcript: "hello world" }] },
      is_final: true,
    });
    fakeStream.emit(LiveTranscriptionEvents.Close);

    expect(transcriptHandler).toHaveBeenCalledWith({
      transcript: "hello world",
      isFinal: true,
    });

    await stream.finish();
  });

  it("emits speech end hints when utterance end fires", async () => {
    const fakeStream = new FakeDeepgramStream();
    const listenLive = vi.fn(() => fakeStream);
    const provider = new DeepgramTranscriptionProvider({
      apiKey: "test",
      modelId: "nova-3",
      clientFactory: () =>
        ({
          listen: {
            live: listenLive,
          },
        }) as any,
    });

    const hintHandler = vi.fn();
    await provider.createStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onSpeechEnd: hintHandler,
      speechEndDetection: { mode: "auto" },
    });

    fakeStream.emit(LiveTranscriptionEvents.Open);
    expect(listenLive).toHaveBeenCalledWith(
      expect.objectContaining({
        utterance_end_ms: "1200",
        vad_events: true,
      })
    );

    fakeStream.emit(LiveTranscriptionEvents.UtteranceEnd, {
      type: "UtteranceEnd",
      last_word_end: 2.1,
    });

    expect(hintHandler).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "utterance_end" })
    );
  });

  it("falls back to speech_final when utterance end is unavailable", async () => {
    const fakeStream = new FakeDeepgramStream();
    const provider = new DeepgramTranscriptionProvider({
      apiKey: "test",
      modelId: "nova-3",
      clientFactory: () =>
        ({
          listen: {
            live: () => fakeStream,
          },
        }) as any,
    });

    const hintHandler = vi.fn();
    await provider.createStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onSpeechEnd: hintHandler,
      speechEndDetection: { mode: "auto" },
    });

    fakeStream.emit(LiveTranscriptionEvents.Open);
    fakeStream.emit(LiveTranscriptionEvents.Transcript, {
      channel: { alternatives: [{ transcript: "ok" }] },
      is_final: true,
      speech_final: true,
    });

    expect(hintHandler).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "speech_final" })
    );
  });

  it("emits speech start hints when vad events fire", async () => {
    const fakeStream = new FakeDeepgramStream();
    const provider = new DeepgramTranscriptionProvider({
      apiKey: "test",
      modelId: "nova-3",
      clientFactory: () =>
        ({
          listen: {
            live: () => fakeStream,
          },
        }) as any,
    });

    const startHandler = vi.fn();
    await provider.createStream({
      onTranscript: vi.fn(),
      onError: vi.fn(),
      onSpeechStart: startHandler,
      speechEndDetection: { mode: "auto" },
    });

    fakeStream.emit(LiveTranscriptionEvents.SpeechStarted, {
      type: "SpeechStarted",
      timestamp: 2.5,
    });

    expect(startHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "speech_started",
        timestampMs: 2500,
      })
    );
  });
});
