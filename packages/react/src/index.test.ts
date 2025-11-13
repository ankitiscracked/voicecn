import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVoiceCommand } from "./useVoiceCommand";
import { VoiceCommandStateStore } from "@usevoice/core";

class MockSocket {
  listeners = new Set<(event: any) => void>();
  sendJson = vi.fn();
  sendBinary = vi.fn();
  ensureConnection = vi.fn(async () => ({} as WebSocket));
  close = vi.fn();

  subscribe(listener: (event: any) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

describe("@usevoice/react useVoiceCommand", () => {
  it("subscribes to state updates", async () => {
    const store = new VoiceCommandStateStore();
    const socket = new MockSocket();

    const { result } = renderHook(() =>
      useVoiceCommand({ state: store, socket: socket as any })
    );

    expect(result.current.status.stage).toBe("idle");

    await act(async () => {
      store.setStatus({ stage: "recording" });
    });

    expect(result.current.status.stage).toBe("recording");
  });

  it("updates transcript from socket events", async () => {
    const store = new VoiceCommandStateStore();
    const socket = new MockSocket();

    const { result } = renderHook(() =>
      useVoiceCommand({ state: store, socket: socket as any })
    );

    await act(async () => {
      socket.listeners.forEach((listener) =>
        listener({
          type: "transcript.partial",
          data: { transcript: "streaming" }
        })
      );
    });

    expect(result.current.status.realtimeText).toBe("streaming");
  });
});
