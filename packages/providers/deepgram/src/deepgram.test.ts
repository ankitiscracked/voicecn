import { describe, expect, it } from "vitest";
import { deepgram } from "./deepgram";
import { DeepgramTranscriptionProvider } from "./deepgramTranscriptionProvider";

describe("deepgram helper", () => {
  it("returns a transcription provider instance", () => {
    const provider = deepgram({ apiKey: "test-key" });
    expect(provider).toBeInstanceOf(DeepgramTranscriptionProvider);
  });
});
