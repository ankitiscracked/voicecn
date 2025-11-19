import { describe, expect, it, vi } from "vitest";
import { VoiceInputController } from "./voiceInputController";
import { VoiceSocketClient } from "../socket/voiceSocketClient";
import { VoiceInputStore } from "../state/voiceInputStore";
import { VoiceRecorder } from "../recorder/voiceRecorder";

class MockSocket implements Partial<VoiceSocketClient> {
  listeners = new Set<(event: any) => void>();
  sendJson = vi.fn();
  sendBinary = vi.fn();
  ensureConnection = vi.fn(async () => ({} as WebSocket));
  close = vi.fn();

  subscribe(listener: (event: any) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: any) {
    this.listeners.forEach((listener) => listener(event));
  }
}

describe("VoiceInputController", () => {
  it("updates state when receiving complete events", async () => {
    const socket = new MockSocket();
    const store = new VoiceInputStore();
    const controller = new VoiceInputController({
      socket: socket as unknown as VoiceSocketClient,
      store,
    });

    socket.emit({
      type: "transcript.final",
      data: { transcript: "hello world" },
    });

    expect(store.getStatus().transcript).toBe("hello world");

    socket.emit({
      type: "complete",
      data: { responseText: "hello agent" },
    });

    expect(store.getResults()).toHaveLength(1);
    expect(store.getResults()[0].data?.responseText).toBe("hello agent");

    controller.destroy();
  });

  it("creates audio streams for tts events", async () => {
    const socket = new MockSocket();
    const store = new VoiceInputStore();
    const controller = new VoiceInputController({
      socket: socket as unknown as VoiceSocketClient,
      store,
    });

    socket.emit({
      type: "tts.start",
      data: { sampleRate: 48_000, encoding: "linear16", channels: 1 },
    });

    const stream = store.getAudioStream();
    expect(stream).toBeTruthy();
    const iterator = stream![Symbol.asyncIterator]();

    const nextChunk = iterator.next();
    const chunk = new ArrayBuffer(4);
    socket.emit(chunk);

    const resolved = await nextChunk;
    expect(resolved.done).toBe(false);
    expect(resolved.value?.byteLength).toBe(4);

    socket.emit({ type: "tts.end" });
    const doneResult = await iterator.next().catch(() => ({ done: true }));
    expect(doneResult.done).toBe(true);

    controller.destroy();
  });

  it("tracks partial transcripts", () => {
    const socket = new MockSocket();
    const store = new VoiceInputStore();
    const controller = new VoiceInputController({
      socket: socket as unknown as VoiceSocketClient,
      store,
    });

    socket.emit({
      type: "transcript.partial",
      data: { transcript: "hello world" },
    });

    expect(store.getStatus().transcript).toBe("hello world");

    controller.destroy();
  });

  it("auto-stops recording when speech end hints arrive", () => {
    const socket = new MockSocket();
    const store = new VoiceInputStore();
    const stopSpy = vi.spyOn(
      VoiceRecorder.prototype,
      "stopFromServerHint"
    );
    const controller = new VoiceInputController({
      socket: socket as unknown as VoiceSocketClient,
      store,
      speechEndDetection: { mode: "auto" },
    });

    socket.emit({ type: "speech-end.hint" });

    expect(store.getStatus().stage).toBe("processing");
    expect(stopSpy).toHaveBeenCalled();

    stopSpy.mockRestore();
    controller.destroy();
  });

  it("stops tts playback when receiving speech start hints", () => {
    const socket = new MockSocket();
    const store = new VoiceInputStore();
    const controller = new VoiceInputController({
      socket: socket as unknown as VoiceSocketClient,
      store,
      speechEndDetection: { mode: "auto" },
    });

    socket.emit({
      type: "tts.start",
      data: { sampleRate: 48_000, encoding: "linear16", channels: 1 },
    });
    expect(store.isAudioPlaying()).toBe(true);

    socket.emit({ type: "speech-start.hint" });

    expect(store.isAudioPlaying()).toBe(false);
    expect(store.getAudioStream()).toBeNull();

    controller.destroy();
  });

  it("auto restarts recording after clean tts playback ends in auto mode", async () => {
    const startSpy = vi
      .spyOn(VoiceRecorder.prototype, "start")
      .mockImplementation(async function () {
        (this as any).isRecording = true;
      });
    const stopHintSpy = vi
      .spyOn(VoiceRecorder.prototype, "stopFromServerHint")
      .mockImplementation(function () {
        (this as any).isRecording = false;
      });

    const socket = new MockSocket();
    const store = new VoiceInputStore();
    const controller = new VoiceInputController({
      socket: socket as unknown as VoiceSocketClient,
      store,
      speechEndDetection: { mode: "auto" },
    });

    await controller.startRecording();
    startSpy.mockClear();

    socket.emit({ type: "speech-end.hint" });
    socket.emit({
      type: "tts.start",
      data: { sampleRate: 48_000, encoding: "linear16", channels: 1 },
    });
    const stream = store.getAudioStream();
    expect(stream).toBeTruthy();

    socket.emit({ type: "tts.end" });

    stream?.release();

    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(startSpy).toHaveBeenCalledTimes(1);

    controller.destroy();
    startSpy.mockRestore();
    stopHintSpy.mockRestore();
  });

  it("restarts recording immediately when speech start hint arrives", async () => {
    const startSpy = vi
      .spyOn(VoiceRecorder.prototype, "start")
      .mockImplementation(async function () {
        (this as any).isRecording = true;
      });
    const stopHintSpy = vi
      .spyOn(VoiceRecorder.prototype, "stopFromServerHint")
      .mockImplementation(function () {
        (this as any).isRecording = false;
      });

    const socket = new MockSocket();
    const store = new VoiceInputStore();
    const controller = new VoiceInputController({
      socket: socket as unknown as VoiceSocketClient,
      store,
      speechEndDetection: { mode: "auto" },
    });

    await controller.startRecording();
    startSpy.mockClear();

    socket.emit({ type: "speech-end.hint" });
    socket.emit({
      type: "tts.start",
      data: { sampleRate: 48_000, encoding: "linear16", channels: 1 },
    });

    socket.emit({ type: "speech-start.hint" });

    expect(startSpy).toHaveBeenCalledTimes(1);

    controller.destroy();
    startSpy.mockRestore();
    stopHintSpy.mockRestore();
  });
});
