import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useVoiceCommand } from "./useVoiceCommand";
import { VoiceInputStore } from "@usevoiceai/core";

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

describe("@usevoiceai/vue useVoiceCommand", () => {
  it("reacts to store updates", async () => {
    const store = new VoiceInputStore();
    const socket = new MockSocket();

    const TestComponent = defineComponent({
      setup() {
        const command = useVoiceCommand({
          state: store,
          socket: socket as any
        });
        return () =>
          h(
            "div",
            {
              "data-stage": command.status.value.stage,
              "data-recording": command.isRecording.value ? "true" : "false"
            },
            ""
          );
      }
    });

    const wrapper = mount(TestComponent);
    expect(wrapper.attributes("data-stage")).toBe("idle");
    expect(wrapper.attributes("data-recording")).toBe("false");

    store.setStatus({ stage: "recording" });
    await wrapper.vm.$nextTick();

    expect(wrapper.attributes("data-stage")).toBe("recording");

    store.setRecording(true);
    await wrapper.vm.$nextTick();

    expect(wrapper.attributes("data-recording")).toBe("true");
  });
});
