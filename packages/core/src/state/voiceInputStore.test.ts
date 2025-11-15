import { describe, expect, it, vi } from "vitest";
import { VoiceInputStore } from "./voiceInputStore";
import { VoiceAudioStream } from "../audio/voiceAudioStream";

describe("VoiceCommandStateStore", () => {
  it("updates status and notifies subscribers", () => {
    const store = new VoiceInputStore();
    const handler = vi.fn();
    store.subscribe(handler);

    store.setStatus({ stage: "recording" });
    expect(store.getStatus().stage).toBe("recording");
    expect(handler).toHaveBeenCalledWith({ stage: "recording" });
  });

  it("pushes results in LIFO order", () => {
    const store = new VoiceInputStore();
    const resultsHandler = vi.fn();
    store.subscribeResults(resultsHandler);

    store.pushResult({ timestamp: 1, confidence: 1 });
    store.pushResult({ timestamp: 2, confidence: 0.8 });

    expect(store.getResults()[0].timestamp).toBe(2);
    expect(resultsHandler).toHaveBeenCalledTimes(2);
  });

  it("notifies playback listeners", () => {
    const store = new VoiceInputStore();
    const playbackHandler = vi.fn();
    store.subscribePlayback(playbackHandler);
    store.setAudioPlayback(true);
    expect(playbackHandler).toHaveBeenCalledWith(true);
  });

  it("tracks audio streams", () => {
    const store = new VoiceInputStore();
    const handler = vi.fn();
    store.subscribeAudioStream(handler);
    const stream = new VoiceAudioStream({
      encoding: "linear16",
      sampleRate: 48_000,
      channels: 1,
      mimeType: "audio/raw",
    });
    store.setAudioStream(stream);
    expect(store.getAudioStream()).toBe(stream);
    expect(handler).toHaveBeenCalledWith(stream);
    store.clearAudioStream();
    expect(store.getAudioStream()).toBeNull();
  });
});
