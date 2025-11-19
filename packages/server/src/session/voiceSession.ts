import type {
  AgentProcessor,
  SpeechEndHint,
  SpeechProvider,
  SpeechStartHint,
  TranscriptionProvider,
  TranscriptionStream,
  VoiceSessionOptions,
} from "../types";
import type {
  SpeechEndDetectionConfig,
  VoiceSocketEvent,
} from "@usevoiceai/core";

type ClientPayload =
  | {
      type: "start";
      timezone?: string;
      audio?: AudioConfig;
      speechEndDetection?: SpeechEndDetectionConfig;
    }
  | { type: "end" }
  | { type: "cancel" }
  | { type: "ping"; timestamp?: number };

type AudioConfig = {
  encoding?: string;
  sampleRate?: number;
  channels?: number;
};

type NormalizedSpeechEndDetectionConfig = SpeechEndDetectionConfig & {
  mode: "manual" | "auto";
};

type ActiveCommand = {
  timezone: string;
  transcriber: TranscriptionStream;
  finalTranscriptChunks: string[];
  startedAt: number;
  speechEndDetection: NormalizedSpeechEndDetectionConfig;
  completionRequested: boolean;
  acceptingAudio: boolean;
  speechEndHintDispatched: boolean;
};

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
const DEFAULT_SPEECH_END_DETECTION: NormalizedSpeechEndDetectionConfig = {
  mode: "manual",
};
type TtsState = {
  streaming: boolean;
  interrupted: boolean;
  endSent: boolean;
};

export class VoiceSession {
  private transcriptionProvider: TranscriptionProvider;
  private agentProcessor: AgentProcessor;
  private speechProvider: SpeechProvider;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity = Date.now();
  private activeCommand: ActiveCommand | null = null;
  private ttsState: TtsState = {
    streaming: false,
    interrupted: false,
    endSent: false,
  };

  constructor(private options: VoiceSessionOptions) {
    this.transcriptionProvider = options.transcriptionProvider;
    this.agentProcessor = options.agentProcessor;
    this.speechProvider = options.speechProvider;
  }

  handleOpen() {
    this.touch();
    this.options.sendJson({
      type: "ready",
      data: {
        timeoutMs: this.options.idleTimeoutMs ?? FIVE_MINUTES_IN_MS,
      },
    });
  }

  async handleMessage(message: string | ArrayBuffer | Blob) {
    this.touch();
    if (typeof message === "string") {
      await this.handleJson(message);
      return;
    }

    if (message instanceof Blob) {
      await this.forwardAudioChunk(await message.arrayBuffer());
      return;
    }

    await this.forwardAudioChunk(message);
  }

  handleClose(code?: number, reason?: string) {
    this.clearInactivityTimer();
    this.teardownActiveCommand(
      reason ?? `socket closed (${code ?? "unknown"})`
    );
  }

  private async handleJson(raw: string) {
    let payload: ClientPayload;
    try {
      payload = JSON.parse(raw) as ClientPayload;
    } catch {
      this.sendError("Invalid JSON payload");
      return;
    }

    switch (payload.type) {
      case "start":
        await this.startCommand(payload);
        break;
      case "end":
        await this.completeCommand("manual");
        break;
      case "cancel":
        this.cancelCommand();
        break;
      case "ping":
        this.options.sendJson({
          type: "pong",
          data: { timestamp: payload.timestamp ?? Date.now() },
        });
        break;
      default:
        this.sendError(`Unsupported event type ${(payload as any).type}`);
    }
  }

  private async startCommand(
    payload: Extract<ClientPayload, { type: "start" }>
  ) {
    if (this.activeCommand) {
      this.sendError("A command is already in progress");
      return;
    }

    try {
      const speechEndDetection = this.normalizeSpeechEndDetection(
        payload.speechEndDetection
      );
      const transcriber = await this.transcriptionProvider.createStream({
        encoding: payload.audio?.encoding,
        sampleRate: payload.audio?.sampleRate,
        channels: payload.audio?.channels,
        speechEndDetection,
        onTranscript: (event) => this.handleTranscript(event),
        onError: (error) => this.handleTranscriptionError(error),
        onSpeechEnd: (hint) => this.handleSpeechEndHint(hint),
        onSpeechStart: (hint) => this.handleSpeechStartHint(hint),
      });

      this.activeCommand = {
        timezone: payload.timezone ?? "UTC",
        transcriber,
        finalTranscriptChunks: [],
        startedAt: Date.now(),
        speechEndDetection,
        completionRequested: false,
        acceptingAudio: true,
        speechEndHintDispatched: false,
      };

      this.options.sendJson({ type: "command-started" });
    } catch (error) {
      this.sendError(
        error instanceof Error
          ? error.message
          : "Failed to start transcription stream"
      );
    }
  }

  private async completeCommand(trigger: "manual" | "auto" = "manual") {
    if (!this.activeCommand) {
      this.sendError("No active command");
      return;
    }

    if (this.activeCommand.completionRequested) {
      return;
    }

    this.activeCommand.completionRequested = true;
    this.activeCommand.acceptingAudio = false;

    try {
      await this.activeCommand.transcriber.finish();
      const finalTranscript = this.activeCommand.finalTranscriptChunks
        .join(" ")
        .trim();
      await this.processTranscript(finalTranscript);
    } catch (error) {
      this.sendError(
        error instanceof Error ? error.message : "Failed to finalize command"
      );
      this.teardownActiveCommand("finalization failed");
    }
  }

  private cancelCommand() {
    if (!this.activeCommand) {
      return;
    }
    this.activeCommand.acceptingAudio = false;
    this.activeCommand.transcriber.abort("command cancelled");
    this.activeCommand = null;
    this.options.sendJson({ type: "command-cancelled" });
  }

  private async forwardAudioChunk(buffer: ArrayBuffer) {
    if (!this.activeCommand || !this.activeCommand.acceptingAudio) {
      return;
    }

    try {
      this.activeCommand.transcriber.send(buffer);
    } catch (error) {
      this.sendError(
        error instanceof Error ? error.message : "Failed to forward audio chunk"
      );
    }
  }

  private async processTranscript(transcript: string) {
    this.options.sendJson({
      type: "transcript.final",
      data: { transcript },
    });

    if (!this.activeCommand) {
      return;
    }

    try {
      await this.agentProcessor.process({
        transcript,
        userId: this.options.userId,
        timezone: this.activeCommand.timezone,
        send: (event: VoiceSocketEvent) => this.forwardAgentEvent(event),
      });
    } catch (error) {
      this.sendError(
        error instanceof Error ? error.message : "Agentic processing failed"
      );
    } finally {
      this.teardownActiveCommand("command complete");
    }
  }

  private async forwardAgentEvent(event: VoiceSocketEvent) {
    this.options.sendJson(event);

    if (event.type !== "complete") {
      return;
    }

    const text =
      event.data?.responseText ?? event.data?.formattedContent?.content;
    if (!text) {
      return;
    }

    if (!this.speechProvider) {
      return;
    }

    this.options.sendJson({
      type: "tts.start",
      data: {
        encoding: "linear16",
        sampleRate: 48000,
        mimeType: "audio/raw",
      },
    });

    this.ttsState = { streaming: true, interrupted: false, endSent: false };
    let handled = false;
    try {
      await this.speechProvider.stream(text, {
        onAudioChunk: (chunk) => {
          if (this.ttsState.endSent) {
            return;
          }
          this.options.sendBinary(chunk);
        },
        onClose: () => {
          this.endTtsStream();
        },
        onError: (error) => {
          handled = true;
          this.sendError(error.message);
          this.endTtsStream({ errored: true });
        },
      });
    } catch (error) {
      if (!handled) {
        const message =
          error instanceof Error ? error.message : "Failed to stream TTS audio";
        this.sendError(message);
        this.endTtsStream({ errored: true });
      }
    } finally {
      this.ttsState = { streaming: false, interrupted: false, endSent: false };
    }
  }

  private handleTranscript(event: { transcript: string; isFinal: boolean }) {
    if (!this.activeCommand) {
      return;
    }

    const trimmed = event.transcript.trim();
    if (
      trimmed.length === 0 &&
      this.activeCommand.finalTranscriptChunks.length === 0
    ) {
      return;
    }

    const combine = (...segments: string[]) =>
      segments
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
        .join(" ");

    if (event.isFinal) {
      if (trimmed.length === 0) {
        return;
      }

      this.activeCommand.finalTranscriptChunks.push(trimmed);
      const aggregate = combine(...this.activeCommand.finalTranscriptChunks);
      if (aggregate.length > 0) {
        this.options.sendJson({
          type: "transcript.partial",
          data: { transcript: aggregate },
        });
      }
      return;
    }

    const aggregate = combine(
      ...this.activeCommand.finalTranscriptChunks,
      trimmed
    );
    if (aggregate.length === 0) {
      return;
    }

    this.options.sendJson({
      type: "transcript.partial",
      data: { transcript: aggregate },
    });
  }

  private handleTranscriptionError(error: Error) {
    this.sendError(error.message);
    this.teardownActiveCommand("transcriber error");
  }

  private handleSpeechStartHint(hint?: SpeechStartHint) {
    this.options.sendJson({
      type: "speech-start.hint",
      data: hint
        ? {
            reason: hint.reason,
            timestampMs: hint.timestampMs,
          }
        : undefined,
    });

    if (this.ttsState.streaming && !this.ttsState.endSent) {
      this.ttsState.interrupted = true;
      this.endTtsStream({ interrupted: true });
      this.ttsState.streaming = false;
    }
  }

  private teardownActiveCommand(reason: string) {
    if (!this.activeCommand) {
      return;
    }

    try {
      this.activeCommand.acceptingAudio = false;
      this.activeCommand.transcriber.abort(reason);
    } catch {
      console.error("Failed to abort transcription stream", reason);
      this.sendError(`Failed to abort transcription stream: ${reason}`);
      // ignore
    }
    this.activeCommand = null;
  }

  private sendError(message: string) {
    this.options.sendJson({
      type: "error",
      data: { error: message },
    });
  }

  private endTtsStream(extra?: { errored?: boolean; interrupted?: boolean }) {
    if (!this.ttsState.streaming || this.ttsState.endSent) {
      return;
    }
    const data: Record<string, unknown> = {};
    if (extra?.errored) {
      data.errored = true;
    }
    if (extra?.interrupted) {
      data.interrupted = true;
    } else if (this.ttsState.interrupted) {
      data.interrupted = true;
    }
    this.ttsState.endSent = true;
    this.options.sendJson({
      type: "tts.end",
      data: Object.keys(data).length > 0 ? data : undefined,
    });
  }

  private touch() {
    this.lastActivity = Date.now();
    this.scheduleInactivityTimer();
  }

  private scheduleInactivityTimer() {
    if (typeof setTimeout !== "function") {
      return;
    }

    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    const timeout = this.options.idleTimeoutMs ?? FIVE_MINUTES_IN_MS;
    this.inactivityTimer = setTimeout(() => {
      const idleTime = Date.now() - this.lastActivity;
      if (idleTime >= timeout) {
        this.options.sendJson({
          type: "timeout",
          data: { idleMs: idleTime },
        });
        this.options.closeSocket(4000, "idle timeout");
      } else {
        this.scheduleInactivityTimer();
      }
    }, timeout);
  }

  private clearInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private normalizeSpeechEndDetection(
    config?: SpeechEndDetectionConfig
  ): NormalizedSpeechEndDetectionConfig {
    if (!config) {
      return { ...DEFAULT_SPEECH_END_DETECTION };
    }
    const mode = config.mode === "auto" ? "auto" : "manual";
    return { ...config, mode };
  }

  private handleSpeechEndHint(hint?: SpeechEndHint) {
    if (!this.activeCommand) {
      return;
    }

    if (this.activeCommand.speechEndDetection.mode !== "auto") {
      return;
    }

    if (this.activeCommand.speechEndHintDispatched) {
      return;
    }

    this.activeCommand.speechEndHintDispatched = true;
    this.activeCommand.acceptingAudio = false;

    this.options.sendJson({
      type: "speech-end.hint",
      data: {
        reason: hint?.reason,
        confidence: hint?.confidence,
      },
    });

    this.completeCommand("auto").catch((error) => {
      const message =
        error instanceof Error ? error.message : "Failed to auto-complete";
      this.sendError(message);
    });
  }
}
