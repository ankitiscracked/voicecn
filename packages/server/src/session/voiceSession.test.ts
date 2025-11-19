import { describe, expect, it, vi } from "vitest";
import { VoiceSession } from "./voiceSession";
import {
  MockAgentProcessor,
  MockSpeechProvider,
  MockTranscriptionProvider,
} from "../mockProviders";
import type { SpeechProvider } from "../types";

class ControlledSpeechProvider implements SpeechProvider {
  private handlers:
    | {
        onAudioChunk: (chunk: ArrayBuffer) => void;
        onClose: () => void;
        onError: (error: Error) => void;
      }
    | null = null;
  private deferred: { resolve: () => void; reject: (error: Error) => void } | null =
    null;

  async stream(
    text: string,
    handlers: Parameters<SpeechProvider["stream"]>[1]
  ): Promise<void> {
    this.handlers = handlers;
    await new Promise<void>((resolve, reject) => {
      this.deferred = { resolve, reject };
    });
  }

  close() {
    if (!this.handlers || !this.deferred) {
      return;
    }
    this.handlers.onClose();
    this.deferred.resolve();
    this.handlers = null;
    this.deferred = null;
  }
}

describe("VoiceSessionManager", () => {
  it("processes transcript and sends events", async () => {
    const sendJson = vi.fn();
    const sendBinary = vi.fn();
    const closeSocket = vi.fn();

    const session = new VoiceSession({
      userId: "user-1",
      transcriptionProvider: new MockTranscriptionProvider({
        transcript: "hello world",
      }),
      agentProcessor: new MockAgentProcessor({ responsePrefix: "result" }),
      speechProvider: new MockSpeechProvider(),
      sendJson,
      sendBinary,
      closeSocket,
    });

    session.handleOpen();
    await session.handleMessage(
      JSON.stringify({
        type: "start",
      })
    );
    await session.handleMessage(JSON.stringify({ type: "end" }));

    expect(sendJson).toHaveBeenCalledWith({ type: "command-started" });
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: "complete" })
    );
  });

  it("auto completes when speech end hints arrive", async () => {
    const sendJson = vi.fn();
    const sendBinary = vi.fn();
    const closeSocket = vi.fn();

    const transcription = new MockTranscriptionProvider({
      transcript: "auto world",
    });

    const session = new VoiceSession({
      userId: "user-2",
      transcriptionProvider: transcription,
      agentProcessor: new MockAgentProcessor({ responsePrefix: "auto" }),
      speechProvider: new MockSpeechProvider(),
      sendJson,
      sendBinary,
      closeSocket,
    });

    session.handleOpen();
    await session.handleMessage(
      JSON.stringify({
        type: "start",
        speechEndDetection: { mode: "auto" },
      })
    );

    transcription.triggerSpeechEnd({ reason: "silence" });

    await Promise.resolve();
    await Promise.resolve();

    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: "speech-end.hint" })
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "transcript.final",
        data: { transcript: "auto world" },
      })
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: "complete" })
    );
  });

  it("interrupts tts when speech start hints arrive", async () => {
    const sendJson = vi.fn();
    const sendBinary = vi.fn();
    const closeSocket = vi.fn();

    const transcription = new MockTranscriptionProvider({
      transcript: "first",
    });

    const speech = new ControlledSpeechProvider();

    const session = new VoiceSession({
      userId: "user-3",
      transcriptionProvider: transcription,
      agentProcessor: new MockAgentProcessor({ responsePrefix: "result" }),
      speechProvider: speech,
      sendJson,
      sendBinary,
      closeSocket,
    });

    session.handleOpen();
    await session.handleMessage(JSON.stringify({ type: "start" }));
    const endPromise = session.handleMessage(JSON.stringify({ type: "end" }));
    await Promise.resolve();
    await Promise.resolve();

    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tts.start" })
    );

    await session.handleMessage(JSON.stringify({ type: "start" }));
    transcription.triggerSpeechStart({ reason: "speech_started" });

    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: "speech-start.hint" })
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tts.end",
        data: expect.objectContaining({ interrupted: true }),
      })
    );

    speech.close();
    await endPromise;
  });
});
