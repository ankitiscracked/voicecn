import { describe, expect, it, vi } from "vitest";
import { attachNodeWebSocketSession } from "./nodeWebSocket";
import { MockAgentProcessor, MockTranscriptionProvider } from "../providers";
import { MockSpeechProvider } from "../providers/speech/mockSpeechProvider";

class FakeWebSocket {
  readyState = 1;
  sent: any[] = [];
  handlers: Record<string, ((...args: any[]) => void)[]> = {};

  send(data: any) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  on(event: string, handler: (...args: any[]) => void) {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(handler);
  }

  emit(event: string, ...args: any[]) {
    this.handlers[event]?.forEach((handler) => handler(...args));
  }
}

describe("attachNodeWebSocketSession", () => {
  it("wires websocket events to session manager", async () => {
    const ws = new FakeWebSocket();
    attachNodeWebSocketSession({
      ws: ws as any,
      userId: "user-1",
      transcriptionProvider: new MockTranscriptionProvider({
        transcript: "hello",
      }),
      agentProcessor: new MockAgentProcessor(),
      speechProvider: new MockSpeechProvider(),
    });

    ws.emit("message", JSON.stringify({ type: "start" }));
    await Promise.resolve();
    ws.emit("message", JSON.stringify({ type: "end" }));

    // Should have sent at least ready + command events
    expect(ws.sent.some((payload) => payload.includes("ready"))).toBe(true);
  });
});
