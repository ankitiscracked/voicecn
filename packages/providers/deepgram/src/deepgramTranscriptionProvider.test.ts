import { describe, expect, it, vi } from "vitest";
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
    expect(() => new DeepgramTranscriptionProvider({ apiKey: "" })).toThrow();
  });

  it("forwards transcript events", async () => {
    const fakeStream = new FakeDeepgramStream();
    const provider = new DeepgramTranscriptionProvider({
      apiKey: "test",
      clientFactory: () =>
        ({
          listen: {
            live: () => fakeStream
          }
        }) as any
    });

    const transcriptHandler = vi.fn();
    const stream = await provider.createStream({
      onTranscript: transcriptHandler
    });

    fakeStream.emit("open");
    fakeStream.emit("Results", {
      channel: { alternatives: [{ transcript: "hello world" }] },
      is_final: true
    });
    fakeStream.emit("close");

    expect(transcriptHandler).toHaveBeenCalledWith({
      transcript: "hello world",
      isFinal: true
    });

    await stream.finish();
  });
});
