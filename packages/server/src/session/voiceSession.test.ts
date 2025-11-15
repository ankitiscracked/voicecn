import { describe, expect, it, vi } from "vitest";
import { VoiceSession } from "./voiceSession";
import {
  MockAgentProcessor,
  MockSpeechProvider,
  MockTranscriptionProvider,
} from "../mockProviders";

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
});
