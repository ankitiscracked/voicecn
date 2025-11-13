import type { VoiceSocketEvent } from "@usevoice/core";

export interface VoiceCommandContext {
  userId: string;
  transcript: string;
  timezone: string;
}

export interface TranscriptionStream {
  send: (chunk: ArrayBuffer | ArrayBufferView) => void;
  finish: () => Promise<void>;
  abort: (reason?: string) => void;
}

export interface TranscriptionProvider {
  createStream: (options: {
    encoding?: string;
    sampleRate?: number;
    channels?: number;
    onTranscript: (event: { transcript: string; isFinal: boolean }) => void;
    onError: (error: Error) => void;
    onClose?: () => void;
  }) => Promise<TranscriptionStream>;
}

export interface AgentProcessor {
  process: (options: {
    transcript: string;
    userId: string;
    timezone: string;
    send: (event: VoiceSocketEvent) => void | Promise<void>;
  }) => Promise<void>;
}

export interface SpeechProvider {
  stream: (
    text: string,
    handlers: {
      onAudioChunk: (chunk: ArrayBuffer) => void;
      onClose: () => void;
      onError: (error: Error) => void;
    }
  ) => Promise<void>;
}

export interface VoiceSessionOptions {
  userId: string;
  transcriptionProvider: TranscriptionProvider;
  agentProcessor: AgentProcessor;
  speechProvider: SpeechProvider;
  idleTimeoutMs?: number;
  sendJson: (payload: VoiceSocketEvent) => void;
  sendBinary: (chunk: ArrayBuffer) => void;
  closeSocket: (code?: number, reason?: string) => void;
}
