import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceRecorder } from "./voiceRecorder";

class FakeMediaStream extends EventTarget implements MediaStream {
  id = "stream";
  active = true;
  onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null =
    null;
  onremovetrack:
    | ((this: MediaStream, ev: MediaStreamTrackEvent) => any)
    | null = null;
  getAudioTracks(): MediaStreamTrack[] {
    return [new FakeMediaStreamTrack()];
  }
  getVideoTracks(): MediaStreamTrack[] {
    return [];
  }
  getTracks(): MediaStreamTrack[] {
    return this.getAudioTracks();
  }
  addTrack(): void {}
  removeTrack(): void {}
  clone(): MediaStream {
    return this;
  }
}

class FakeMediaStreamTrack implements MediaStreamTrack {
  enabled = true;
  id = "track";
  kind: "audio" | "video" = "audio";
  label = "fake";
  muted = false;
  onended: ((this: MediaStreamTrack, ev: Event) => any) | null = null;
  onmute: ((this: MediaStreamTrack, ev: Event) => any) | null = null;
  onunmute: ((this: MediaStreamTrack, ev: Event) => any) | null = null;
  readyState: MediaStreamTrackState = "live";
  contentHint = "";
  applyConstraints(): Promise<void> {
    return Promise.resolve();
  }
  clone(): MediaStreamTrack {
    return this;
  }
  getCapabilities(): MediaTrackCapabilities {
    return {};
  }
  getConstraints(): MediaTrackConstraints {
    return {};
  }
  getSettings(): MediaTrackSettings {
    return {};
  }
  stop(): void {
    this.readyState = "ended";
  }
  addEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }
  removeEventListener(): void {}
}

class FakeMediaRecorder implements MediaRecorder {
  audioBitsPerSecond: number | null = null;
  ignoreMutedMedia = false;
  mimeType = "audio/webm";
  state: RecordingState = "inactive";
  stream: MediaStream;
  videoBitsPerSecond: number | null = null;
  ondataavailable: ((this: MediaRecorder, ev: BlobEvent) => any) | null = null;
  onerror: ((this: MediaRecorder, ev: MediaRecorderErrorEvent) => any) | null =
    null;
  onpause: ((this: MediaRecorder, ev: Event) => any) | null = null;
  onresume: ((this: MediaRecorder, ev: Event) => any) | null = null;
  onstart: ((this: MediaRecorder, ev: Event) => any) | null = null;
  onstop: ((this: MediaRecorder, ev: Event) => any) | null = null;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  start(): void {
    this.state = "recording";
    queueMicrotask(() => {
      this.onstart?.call(this, new Event("start"));
    });
  }

  stop(): void {
    this.state = "inactive";
    queueMicrotask(() => {
      this.onstop?.call(this, new Event("stop"));
    });
  }

  pause(): void {
    this.state = "paused";
  }

  resume(): void {
    this.state = "recording";
  }

  requestData(): void {
    const blob = new Blob();
    this.ondataavailable?.call(
      this,
      new BlobEvent("dataavailable", { data: blob })
    );
  }

  addEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }
  removeEventListener(): void {}
}

describe("VoiceRecorderController", () => {
  beforeEach(() => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder as any);
  });

  it("starts and stops recording", async () => {
    const sendBinary = vi.fn();
    const sendJson = vi.fn();

    const controller = new VoiceRecorder({
      mediaDevices: {
        getUserMedia: vi.fn(async () => new FakeMediaStream()),
      } as unknown as MediaDevices,
      sendBinary,
      sendJson,
      onSocketReady: vi.fn(),
      onRecordingEnded: vi.fn(),
      onCancel: vi.fn(),
    });

    await controller.start();
    expect(controller.recording).toBe(true);
    controller.stop();
    await Promise.resolve();
    expect(sendJson).toHaveBeenCalledWith({ type: "end" });
  });

  it("suppresses end event when stopped via server hint", async () => {
    const sendJson = vi.fn();
    const onRecordingEnded = vi.fn();
    const controller = new VoiceRecorder({
      mediaDevices: {
        getUserMedia: vi.fn(async () => new FakeMediaStream()),
      } as unknown as MediaDevices,
      sendBinary: vi.fn(),
      sendJson,
      onSocketReady: vi.fn(),
      onRecordingEnded,
      onCancel: vi.fn(),
    });

    await controller.start();
    controller.stopFromServerHint();
    await Promise.resolve();

    const eventTypes = sendJson.mock.calls.map((call) => call[0].type);
    expect(eventTypes).toContain("start");
    expect(eventTypes).not.toContain("end");
    expect(onRecordingEnded).toHaveBeenCalledTimes(1);
  });
});
