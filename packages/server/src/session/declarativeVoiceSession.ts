import type { VoiceSocketEvent } from "@usevoice/core";
import type {
  AgentProcessor,
  TranscriptionProvider,
  SpeechProvider,
} from "../types";
import { VoiceSessionManager } from "./voiceSessionManager";
import { createAsyncQueue, type AsyncQueue } from "../utils/asyncQueue";
import { createDeferred, type Deferred } from "../utils/deferred";
import { EventEmitter } from "../utils/eventEmitter";

export interface VoiceSessionTranscript {
  transcript: string;
  startedAt: number;
  completedAt: number;
}

export interface VoiceSessionTextChannel {
  stream: () => AsyncIterable<string>;
  final: Promise<VoiceSessionTranscript | null>;
}

export interface VoiceSessionAgentChannel {
  stream: () => AsyncIterable<VoiceSocketEvent>;
  final: Promise<VoiceSocketEvent | null>;
}

export interface VoiceSessionSpeechChannel {
  stream: () => AsyncIterable<ArrayBuffer>;
}

export interface VoiceSessionCommand {
  id: string;
  startedAt: number;
  text: VoiceSessionTextChannel;
  agent: VoiceSessionAgentChannel;
  speech: VoiceSessionSpeechChannel;
}

export interface DeclarativeVoiceSessionTransport {
  sendJson: (payload: VoiceSocketEvent) => void;
  sendBinary: (chunk: ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
}

export interface VoiceSessionProviders {
  transcription: TranscriptionProvider;
  agent: AgentProcessor;
  speech: SpeechProvider;
}

export interface DeclarativeVoiceSessionOptions {
  userId: string;
  providers: VoiceSessionProviders;
  idleTimeoutMs?: number;
  transport: DeclarativeVoiceSessionTransport;
}

export interface DeclarativeVoiceSession {
  handleOpen: () => void;
  handleMessage: (message: string | ArrayBuffer | Blob) => Promise<void>;
  handleClose: (code?: number, reason?: string) => void;
  on: (event: string, handler: (payload: unknown) => void) => () => void;
  once: (event: string, handler: (payload: unknown) => void) => () => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
  commands: () => AsyncIterable<VoiceSessionCommand>;
}

type CommandChannels = {
  id: string;
  startedAt: number;
  textQueue: AsyncQueue<string>;
  agentQueue: AsyncQueue<VoiceSocketEvent>;
  speechQueue: AsyncQueue<ArrayBuffer>;
  transcript: Deferred<VoiceSessionTranscript | null>;
  agentComplete: Deferred<VoiceSocketEvent | null>;
  ttsActive: boolean;
  awaitingTts: boolean;
  closed: boolean;
};

export function createVoiceWebSocketSession(
  options: DeclarativeVoiceSessionOptions
): DeclarativeVoiceSession {
  const emitter = new EventEmitter<Record<string, unknown>>();
  const commandsQueue = createAsyncQueue<VoiceSessionCommand>();
  let commandCounter = 0;
  let activeCommand: CommandChannels | null = null;

  const manager = new VoiceSessionManager({
    userId: options.userId,
    transcriptionProvider: options.providers.transcription,
    agentProcessor: options.providers.agent,
    speechProvider: options.providers.speech,
    idleTimeoutMs: options.idleTimeoutMs,
    sendJson: (payload) => {
      emitEvent(payload.type, payload);
      routeManagerEvent(payload);
      options.transport.sendJson(payload);
    },
    sendBinary: (chunk) => {
      emitter.emit("binary", chunk);
      if (activeCommand && activeCommand.ttsActive && !activeCommand.closed) {
        activeCommand.speechQueue.push(chunk);
      }
      options.transport.sendBinary(chunk);
    },
    closeSocket: (code, reason) => {
      options.transport.close(code, reason);
    },
  });

  function emitEvent(event: string, payload: unknown) {
    emitter.emit(event, payload);
  }

  function startCommand() {
    const id = `command-${++commandCounter}`;
    const textQueue = createAsyncQueue<string>();
    const agentQueue = createAsyncQueue<VoiceSocketEvent>();
    const speechQueue = createAsyncQueue<ArrayBuffer>();
    const transcript = createDeferred<VoiceSessionTranscript | null>();
    const agentComplete = createDeferred<VoiceSocketEvent | null>();
    const channel: CommandChannels = {
      id,
      startedAt: Date.now(),
      textQueue,
      agentQueue,
      speechQueue,
      transcript,
      agentComplete,
      ttsActive: false,
      awaitingTts: false,
      closed: false,
    };

    activeCommand = channel;

    const command: VoiceSessionCommand = {
      id,
      startedAt: channel.startedAt,
      text: {
        stream: () => textQueue.iterator(),
        final: transcript.promise,
      },
      agent: {
        stream: () => agentQueue.iterator(),
        final: agentComplete.promise,
      },
      speech: {
        stream: () => speechQueue.iterator(),
      },
    };

    commandsQueue.push(command);
  }

  function resolveTranscript(text: string | undefined) {
    if (!activeCommand || !text) {
      return;
    }
    if (!activeCommand.transcript.settled()) {
      activeCommand.transcript.resolve({
        transcript: text,
        startedAt: activeCommand.startedAt,
        completedAt: Date.now(),
      });
    }
  }

  function closeCommand() {
    if (!activeCommand || activeCommand.closed) {
      return;
    }

    const channel = activeCommand;
    activeCommand = null;
    channel.closed = true;

    channel.textQueue.close();
    channel.agentQueue.close();
    if (!channel.transcript.settled()) {
      channel.transcript.resolve(null);
    }
    if (!channel.agentComplete.settled()) {
      channel.agentComplete.resolve(null);
    }
    if (!channel.ttsActive) {
      channel.speechQueue.close();
    }
  }

  function failCommand(error: Error) {
    if (!activeCommand || activeCommand.closed) {
      return;
    }

    activeCommand.textQueue.fail(error);
    activeCommand.agentQueue.fail(error);
    activeCommand.speechQueue.fail(error);
    if (!activeCommand.transcript.settled()) {
      activeCommand.transcript.reject(error);
    }
    if (!activeCommand.agentComplete.settled()) {
      activeCommand.agentComplete.reject(error);
    }
    activeCommand.closed = true;
    activeCommand = null;
  }

  function routeManagerEvent(event: VoiceSocketEvent) {
    switch (event.type) {
      case "command-started":
        startCommand();
        break;
      case "transcript.partial":
        if (activeCommand) {
          const text = event.data?.transcript;
          if (typeof text === "string" && text.length > 0) {
            activeCommand.textQueue.push(text);
          }
        }
        break;
      case "transcript.final":
        if (activeCommand) {
          const text = event.data?.transcript;
          if (typeof text === "string" && text.length > 0) {
            resolveTranscript(text);
          } else if (!activeCommand.transcript.settled()) {
            activeCommand.transcript.resolve(null);
          }
          activeCommand.textQueue.close();
        }
        break;
      case "complete":
        if (activeCommand) {
          activeCommand.agentQueue.push(event);
          if (!activeCommand.agentComplete.settled()) {
            activeCommand.agentComplete.resolve(event);
          }
          const expectsTts =
            Boolean(options.providers.speech) &&
            typeof event.data?.formattedContent?.content === "string" &&
            event.data.formattedContent.content.length > 0;
          activeCommand.awaitingTts = expectsTts;

          if (!expectsTts) {
            closeCommand();
          }
        }
        break;
      case "tts.start":
        if (activeCommand) {
          activeCommand.ttsActive = true;
          activeCommand.awaitingTts = false;
        }
        break;
      case "tts.end":
        if (activeCommand) {
          activeCommand.ttsActive = false;
          activeCommand.speechQueue.close();
          closeCommand();
        }
        break;
      case "command-cancelled":
        closeCommand();
        break;
      case "timeout":
        failCommand(new Error("voice session timed out"));
        break;
      case "error":
        failCommand(
          new Error(event.data?.error ?? "voice session encountered an error")
        );
        break;
      default:
        break;
    }
  }

  return {
    handleOpen: () => manager.handleOpen(),
    handleMessage: (message) => manager.handleMessage(message),
    handleClose: (code?: number, reason?: string) => {
      manager.handleClose(code, reason);
      if (activeCommand && !activeCommand.closed) {
        failCommand(new Error(reason ?? "socket closed"));
      }
      commandsQueue.close();
    },
    on: (event, handler) => emitter.on(event, handler),
    once: (event, handler) => emitter.once(event, handler),
    off: (event, handler) => emitter.off(event, handler),
    commands: () => commandsQueue.iterator(),
  };
}
