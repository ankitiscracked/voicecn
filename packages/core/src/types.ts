export type SpeechEndDetectionMode = "manual" | "auto";

export interface SpeechEndDetectionConfig {
  mode?: SpeechEndDetectionMode;
  provider?: string;
  options?: Record<string, unknown>;
}

export interface SpeechStartHint {
  timestampMs?: number;
  reason?: string;
  providerPayload?: unknown;
}

export type VoiceCommandStage =
  | "idle"
  | "recording"
  | "processing"
  | "completed"
  | "error";

export interface VoiceCommandStatus {
  stage: VoiceCommandStage;
  transcript?: string | null;
  error?: string;
  startedAt?: number;
}

export interface VoiceInputResult {
  timestamp: number;
  data?: Record<string, unknown> & { responseText?: string };
  error?: string;
}

export type VoiceSocketEvent =
  | { type: "ready"; data?: Record<string, unknown> }
  | { type: "command-started" }
  | { type: "transcript.partial"; data?: { transcript?: string } }
  | { type: "transcript.final"; data?: { transcript?: string } }
  | { type: "tool-message"; data?: { message?: string } }
  | {
      type: "complete";
      data?: Record<string, unknown> & { responseText?: string };
    }
  | { type: "command-cancelled" }
  | { type: "tts.start"; data?: Record<string, unknown> }
  | { type: "tts.end"; data?: { errored?: boolean } }
  | { type: "timeout"; data?: Record<string, unknown> }
  | { type: "error"; data?: { error?: string } }
  | { type: "closed"; data?: { code?: number; reason?: string } }
  | { type: "pong"; data?: { timestamp?: number } }
  | { type: "speech-end.hint"; data?: { reason?: string; confidence?: number } }
  | { type: "speech-start.hint"; data?: { reason?: string; timestampMs?: number } }
  | { type: string; data?: any };

export interface VoiceSocketClientOptions {
  /**
   * Static websocket URL. Provide either `url` or `buildUrl`.
   */
  url?: string;
  /**
   * Lazily build the websocket URL (useful when it depends on auth tokens).
   */
  buildUrl?: () => string | Promise<string>;
  /**
   * Idle timeout after which the socket will be closed automatically.
   * Defaults to 5 minutes.
   */
  idleTimeoutMs?: number;
  /**
   * Interval used to send ping frames to keep the connection alive.
   * Defaults to 60 seconds.
   */
  pingIntervalMs?: number;
  /**
   * Provide a custom WebSocket implementation (for SSR/unit tests).
   * Defaults to `globalThis.WebSocket`.
   */
  WebSocketImpl?: typeof WebSocket;
}

export interface RecorderHooks {
  onSocketReady: () => Promise<void> | void;
  onRecordingEnded: () => Promise<void> | void;
  onCancel: () => Promise<void> | void;
}

export interface RecorderOptions extends RecorderHooks {
  /**
   * Optional MediaDevices reference (used for SSR-friendly unit tests).
   */
  mediaDevices?: MediaDevices;
  /**
   * Configure how the recorder should treat speech end events.
   */
  speechEndDetection?: SpeechEndDetectionConfig;
  /**
   * Recorder chunk duration in ms.
   */
  chunkMs?: number;
  /**
   * Callback to send binary chunks (typically to VoiceSocketClient).
   */
  sendBinary: (chunk: ArrayBuffer | Blob) => Promise<void> | void;
  /**
   * Callback to send JSON payloads (start/end/cancel control messages).
   */
  sendJson: (payload: Record<string, unknown>) => Promise<void> | void;
}
