import { VoiceRecorder } from "../recorder/voiceRecorder";
import { VoiceSocketClient } from "../socket/voiceSocketClient";
import { VoiceInputStore } from "../state/voiceInputStore";
import { VoiceAudioStream } from "../audio/voiceAudioStream";
import type { VoiceInputResult, VoiceSocketEvent } from "../types";

export interface VoiceCommandControllerOptions {
  socket: VoiceSocketClient;
  store?: VoiceInputStore;
  notifications?: {
    success?: (message: string) => void;
    error?: (message: string) => void;
  };
  onVoiceInputResult?: (result: VoiceInputResult | null) => void;
  mediaDevices?: MediaDevices;
}

export class VoiceInputController {
  private recorder: VoiceRecorder;
  private unsubSocket: (() => void) | null = null;
  private voiceInputResult: VoiceInputResult | null = null;
  private audioStream: VoiceAudioStream | null = null;
  private store: VoiceInputStore;

  constructor(private options: VoiceCommandControllerOptions) {
    if (options.store) {
      this.store = options.store;
    } else {
      this.store = new VoiceInputStore();
    }
    this.recorder = new VoiceRecorder({
      sendBinary: (chunk) => this.options.socket.sendBinary(chunk),
      sendJson: (payload) => this.options.socket.sendJson(payload),
      onSocketReady: () => this.handleSocketReady(),
      onRecordingEnded: () => this.handleRecordingEnded(),
      onCancel: () => this.handleCancel(),
      mediaDevices: this.options.mediaDevices,
    });
  }

  init() {
    if (this.unsubSocket) {
      return;
    }

    this.unsubSocket = this.options.socket.subscribe((event) => {
      console.log("handing socket event", event);
      this.handleSocketEvent(event);
    });
  }

  getVoiceInputResult() {
    return this.voiceInputResult;
  }

  getRecorderStream() {
    return this.recorder.stream ?? null;
  }

  async startRecording() {
    this.store.setStatus({
      stage: "recording",
      startedAt: Date.now(),
    });
    try {
      await this.recorder.start();
    } catch (error) {
      this.store.setStatus({
        stage: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  stopRecording() {
    this.recorder.stop();
  }

  async cancelRecording() {
    await this.recorder.cancel();
  }

  destroy() {
    this.unsubSocket?.();
    this.unsubSocket = null;
    this.closeAudioStream();
    this.store.resetButKeepResults();
  }

  private async handleSocketReady() {
    this.closeAudioStream();
    this.store.setAudioPlayback(false);
    this.store.setStatus({ transcript: null });
    await this.options.socket.ensureConnection();
  }

  private async handleRecordingEnded() {
    this.store.updateStage("processing");
  }

  private async handleCancel() {
    this.store.resetStatus();
    this.closeAudioStream();
    this.store.setAudioPlayback(false);
    this.store.setStatus({ transcript: undefined });
  }

  private async handleSocketEvent(event: VoiceSocketEvent | ArrayBuffer) {
    if (event instanceof ArrayBuffer) {
      this.audioStream?.push(event);
      return;
    }

    const { type } = event;
    const data = "data" in event ? event.data : undefined;

    switch (type) {
      case "transcript.partial":
      case "transcript.final":
        this.store.setStatus({
          transcript: data.transcript,
        });
        break;
      case "tool-message":
        this.store.setStatus({ stage: "processing" });
        break;
      case "complete":
        await this.handleComplete(data);
        break;
      case "command-cancelled":
        this.store.resetButKeepResults();
        break;
      case "tts.start":
        this.closeAudioStream();
        this.audioStream = new VoiceAudioStream({
          encoding: (data?.encoding as string) ?? "linear16",
          sampleRate: (data?.sampleRate as number) ?? 48_000,
          channels: (data?.channels as number) ?? 1,
          mimeType: (data?.mimeType as string) ?? "audio/raw",
        });
        this.attachAudioStreamHandlers(this.audioStream);
        this.store.setAudioStream(this.audioStream);
        this.store.setAudioPlayback(true);
        break;
      case "tts.end":
        if (data?.errored) {
          this.closeAudioStream(new Error("tts stream ended with error"));
          this.store.setAudioPlayback(false);
        } else {
          this.closeAudioStream(undefined, { waitForRelease: true });
        }
        break;
      case "timeout":
        this.options.socket.close();
        this.store.resetButKeepResults();
        break;
      case "error":
        this.store.setStatus({
          stage: "error",
          error:
            data?.error ??
            "Something went wrong while processing the voice input.",
        });
        this.store.setStatus({ transcript: null });
        this.options.notifications?.error?.(
          data?.error ??
            "Something went wrong while processing the voice command."
        );
        break;
      case "closed":
        this.store.resetStatus();
        this.closeAudioStream();
        this.store.setAudioPlayback(false);
        this.store.setStatus({ transcript: undefined });
        break;
    }
  }

  private closeAudioStream(
    error?: Error,
    options?: { waitForRelease?: boolean }
  ) {
    if (!this.audioStream) {
      return;
    }
    const stream = this.audioStream;
    if (error) {
      stream.fail(error);
    } else {
      stream.close();
    }
    if (!options?.waitForRelease) {
      stream.release();
    }
    if (this.audioStream === stream) {
      this.audioStream = null;
    }
  }

  private attachAudioStreamHandlers(stream: VoiceAudioStream) {
    stream.onRelease((released) => {
      const active = this.store.getAudioStream();
      if (active && active.id === released.id) {
        this.store.setAudioStream(null);
        this.store.setAudioPlayback(false);
      }
      if (this.audioStream && this.audioStream.id === released.id) {
        this.audioStream = null;
      }
    });
  }

  private async handleComplete(payload: any) {
    this.store.setStatus({ stage: "completed" });
    const result: VoiceInputResult = {
      timestamp: Date.now(),
      data: {
        responseText: payload?.responseText ?? "",
      },
    };

    this.store.pushResult(result);
    this.options.onVoiceInputResult?.(result);
  }
}
