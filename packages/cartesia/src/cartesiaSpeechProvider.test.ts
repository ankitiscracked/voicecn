import { describe, expect, it, vi } from "vitest";
import { CartesiaSpeechProvider } from "./cartesiaSpeechProvider";

async function* fakeStream(events: any[]) {
  for (const event of events) {
    yield event;
  }
}

describe("CartesiaTtsStreamer", () => {
  it("validates required config", () => {
    expect(
      () => new CartesiaSpeechProvider({ apiKey: "", voiceId: "" })
    ).toThrow();
  });

  it("streams audio chunks", async () => {
    const onAudioChunk = vi.fn();
    const onClose = vi.fn();

    const streamer = new CartesiaSpeechProvider({
      apiKey: "key",
      voiceId: "voice-123",
      clientFactory: () =>
        ({
          tts: {
            sse: async () =>
              fakeStream([
                { type: "chunk", data: Buffer.from("demo").toString("base64") },
                { type: "done" },
              ]),
          },
        } as any),
    });

    await streamer.stream("hello", {
      onAudioChunk,
      onClose,
      onError: vi.fn(),
    });

    expect(onAudioChunk).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
