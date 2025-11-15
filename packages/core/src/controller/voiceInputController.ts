import { VoiceRecorder } from "../recorder/voiceRecorder";
import { VoiceSocketClient } from "../socket/voiceSocketClient";
import { VoiceInputStore } from "../state/voiceInputStore";
import { VoiceAudioStream } from "../audio/voiceAudioStream";
import type { VoiceCommandResult, VoiceSocketEvent } from "../types";

export interface VoiceCommandControllerOptions {
  socket: VoiceSocketClient;
  store?: VoiceInputStore;
  notifications?: {
    success?: (message: string) => void;
    error?: (message: string) => void;
  };
  onQueryResponse?: (response: VoiceCommandResult | null) => void;
  mediaDevices?: MediaDevices;
}

const INTENT_SUCCESS_MESSAGES: Record<string, string> = {
  create: "Voice command saved successfully!",
  update: "Voice command updated successfully!",
  delete: "Voice command deleted successfully!",
};

export class VoiceInputController {
  private recorder: VoiceRecorder;
  private unsubSocket: (() => void) | null = null;
  private queryResponse: VoiceCommandResult | null = null;
  private audioStream: VoiceAudioStream | null = null;
  private latestTranscript = "";
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

  getQueryResponse() {
    return this.queryResponse;
  }

  getRecorderStream() {
    return this.recorder.stream ?? null;
  }

  async startRecording() {
    this.store.setStatus({
      stage: "recording",
      startedAt: Date.now(),
      error: undefined,
      transcript: undefined,
    });
    this.latestTranscript = "";
    try {
      await this.recorder.start();
    } catch (error) {
      this.store.resetStatus();
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
    this.store.resetStatus();
    this.closeAudioStream();
    this.store.setAudioPlayback(false);
    this.store.setAudioStream(null);
    this.latestTranscript = "";
  }

  private async handleSocketReady() {
    this.queryResponse = null;
    this.latestTranscript = "";
    this.closeAudioStream();
    this.store.setAudioPlayback(false);
    this.store.setStatus({
      transcript: undefined,
    });
    await this.options.socket.ensureConnection();
  }

  private async handleRecordingEnded() {
    this.store.setStatus({ stage: "transcribing" });
  }

  private async handleCancel() {
    this.store.resetStatus();
    this.closeAudioStream();
    this.store.setAudioPlayback(false);
    this.store.setStatus({ transcript: undefined });
    this.latestTranscript = "";
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
        if (typeof data?.transcript === "string") {
          this.store.setStatus({
            transcript: data.transcript,
          });
          this.latestTranscript = data.transcript;
        }
        break;
      case "transcript.final":
        if (typeof data?.transcript === "string") {
          this.store.setStatus({
            transcript: data.transcript,
          });
          this.latestTranscript = data.transcript;
        }
        break;
      case "tool-message":
        this.store.setStatus({ stage: "processing" });
        break;
      case "complete":
        await this.handleComplete(data);
        break;
      case "command-cancelled":
        this.store.resetStatus();
        this.closeAudioStream();
        this.store.setAudioPlayback(false);
        this.store.setStatus({ transcript: undefined });
        this.latestTranscript = "";
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
        this.store.resetStatus();
        this.closeAudioStream();
        this.store.setAudioPlayback(false);
        this.store.setStatus({ transcript: undefined });
        this.latestTranscript = "";
        break;
      case "error":
        this.store.setStatus({
          stage: "error",
          error:
            data?.error ??
            "Something went wrong while processing the voice command.",
        });
        this.closeAudioStream();
        this.store.setAudioPlayback(false);
        this.store.setStatus({ transcript: undefined });
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
        this.latestTranscript = "";
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
    const formattedContent = payload?.formattedContent ?? null;
    const result: VoiceCommandResult = {
      timestamp: Date.now(),
      confidence: 1,
      data: {
        intent: payload?.intent ?? "fetch",
        transcript:
          (payload?.transcript as string | undefined) ?? this.latestTranscript,
        formattedContent,
        graphPaths: payload?.graphPaths ?? [],
        fallbackResults: payload?.fallbackResults ?? [],
        timestamp: payload?.timestamp ?? Date.now(),
      },
    };

    this.store.pushResult(result);

    if (result.data?.intent === "fetch") {
      this.queryResponse = result;
      this.options.onQueryResponse?.(result);
    } else {
      const intent = result.data?.intent ?? "operation";
      const message =
        INTENT_SUCCESS_MESSAGES[intent] ?? "Operation completed successfully!";
      this.options.notifications?.success?.(message);
    }
  }
}
