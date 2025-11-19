import { VoiceRecorder } from "../recorder/voiceRecorder";
import { VoiceSocketClient } from "../socket/voiceSocketClient";
import { VoiceInputStore } from "../state/voiceInputStore";
import { VoiceAudioStream } from "../audio/voiceAudioStream";
import type {
  SpeechEndDetectionConfig,
  SpeechEndDetectionMode,
  SpeechStartHint,
  VoiceInputResult,
  VoiceSocketEvent,
} from "../types";

type StreamCloseReason = "normal" | "interrupted" | "error" | undefined;

type NormalizedSpeechEndDetectionConfig = SpeechEndDetectionConfig & {
  mode: SpeechEndDetectionMode;
};

export interface VoiceCommandControllerOptions {
  socket: VoiceSocketClient;
  store?: VoiceInputStore;
  notifications?: {
    success?: (message: string) => void;
    error?: (message: string) => void;
  };
  onVoiceInputResult?: (result: VoiceInputResult | null) => void;
  mediaDevices?: MediaDevices;
  speechEndDetection?: SpeechEndDetectionConfig;
}

export class VoiceInputController {
  private recorder: VoiceRecorder;
  private unsubSocket: (() => void) | null = null;
  private voiceInputResult: VoiceInputResult | null = null;
  private audioStream: VoiceAudioStream | null = null;
  private store: VoiceInputStore;
  private speechEndDetection: NormalizedSpeechEndDetectionConfig;
  private audioReleaseReasons = new Map<string, StreamCloseReason>();
  private autoRestartTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly autoRestartDelayMs = 200;

  constructor(private options: VoiceCommandControllerOptions) {
    if (options.store) {
      this.store = options.store;
    } else {
      this.store = new VoiceInputStore();
    }
    this.speechEndDetection = {
      ...(options.speechEndDetection ?? {}),
      mode: options.speechEndDetection?.mode ?? "manual",
    };
    this.recorder = new VoiceRecorder({
      sendBinary: (chunk) => this.options.socket.sendBinary(chunk),
      sendJson: (payload) => this.options.socket.sendJson(payload),
      onSocketReady: () => this.handleSocketReady(),
      onRecordingEnded: () => this.handleRecordingEnded(),
      onCancel: () => this.handleCancel(),
      mediaDevices: this.options.mediaDevices,
      speechEndDetection: this.speechEndDetection,
    });

    this.init();
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
    this.clearAutoRestartTimer();
    this.recorder.stop();
  }

  async cancelRecording() {
    this.clearAutoRestartTimer();
    await this.recorder.cancel();
  }

  destroy() {
    this.unsubSocket?.();
    this.unsubSocket = null;
    this.closeAudioStream();
    this.store.resetButKeepResults();
    this.clearAutoRestartTimer();
    this.audioReleaseReasons.clear();
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
        if (data?.errored || data?.interrupted) {
          const error =
            data?.errored && !data?.interrupted
              ? new Error("tts stream ended with error")
              : new Error("tts stream interrupted");
          this.closeAudioStream(error, {
            reason: data?.interrupted ? "interrupted" : "error",
          });
          this.store.setAudioPlayback(false);
        } else {
          this.closeAudioStream(undefined, {
            waitForRelease: true,
            reason: "normal",
          });
        }
        break;
      case "timeout":
        this.options.socket.close();
        this.store.resetButKeepResults();
        break;
      case "speech-end.hint":
        this.handleSpeechEndHint();
        break;
      case "speech-start.hint":
        this.handleSpeechStartHint(data);
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
    options?: { waitForRelease?: boolean; reason?: StreamCloseReason }
  ) {
    if (!this.audioStream) {
      return;
    }
    const stream = this.audioStream;
    this.audioReleaseReasons.set(stream.id, options?.reason);
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
      const reason = this.audioReleaseReasons.get(released.id);
      this.audioReleaseReasons.delete(released.id);
      this.handleAudioStreamReleased(reason);
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
    this.voiceInputResult = result;
    this.options.onVoiceInputResult?.(result);
  }

  private handleSpeechEndHint() {
    if (this.speechEndDetection.mode !== "auto") {
      return;
    }
    this.store.updateStage("processing");
    this.recorder.stopFromServerHint();
  }

  private handleSpeechStartHint(data?: SpeechStartHint) {
    if (this.speechEndDetection.mode !== "auto") {
      return;
    }
    this.clearAutoRestartTimer();
    this.closeAudioStream(new Error("tts interrupted by user"), {
      reason: "interrupted",
    });
    this.store.setAudioPlayback(false);
    this.store.updateStage("recording");
    this.triggerAutoRestart("speech-start");
  }

  private handleAudioStreamReleased(reason?: StreamCloseReason) {
    if (reason === "normal") {
      this.triggerAutoRestart("playback-ended");
      return;
    }
    this.clearAutoRestartTimer();
  }

  private triggerAutoRestart(source: "playback-ended" | "speech-start") {
    if (this.speechEndDetection.mode !== "auto") {
      return;
    }
    if (this.recorder.recording) {
      return;
    }

    const status = this.store.getStatus();
    if (status.stage === "error") {
      return;
    }

    this.clearAutoRestartTimer();

    const attemptStart = () => {
      this.autoRestartTimer = null;
      this.startRecording().catch((error) => {
        console.warn("auto restart failed", error);
      });
    };

    if (source === "speech-start") {
      attemptStart();
      return;
    }

    if (typeof setTimeout !== "function") {
      attemptStart();
      return;
    }

    this.autoRestartTimer = setTimeout(() => {
      attemptStart();
    }, this.autoRestartDelayMs);
  }

  private clearAutoRestartTimer() {
    if (this.autoRestartTimer) {
      clearTimeout(this.autoRestartTimer);
      this.autoRestartTimer = null;
    }
  }
}
