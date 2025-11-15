import { VoiceSession } from "../session/voiceSession";
import type {
  AgentProcessor,
  TranscriptionProvider,
  SpeechProvider,
} from "../types";

export interface NodeWebSocketLike {
  readyState: number;
  send: (data: string | ArrayBuffer | Buffer) => void;
  close: (code?: number, reason?: string) => void;
  on: (
    event: "message" | "close" | "error",
    handler: (...args: any[]) => void
  ) => void;
}

export interface NodeWebSocketAdapterOptions {
  ws: NodeWebSocketLike;
  userId: string;
  transcriptionProvider: TranscriptionProvider;
  agentProcessor: AgentProcessor;
  speechProvider: SpeechProvider;
}

const NODE_WS_OPEN_STATE = 1;

export function attachNodeWebSocketSession({
  ws,
  userId,
  transcriptionProvider,
  agentProcessor,
  speechProvider,
}: NodeWebSocketAdapterOptions) {
  const manager = new VoiceSession({
    userId,
    transcriptionProvider,
    agentProcessor,
    speechProvider,
    sendJson: (payload) => {
      if (ws.readyState === NODE_WS_OPEN_STATE) {
        ws.send(JSON.stringify(payload));
      }
    },
    sendBinary: (chunk) => {
      if (ws.readyState === NODE_WS_OPEN_STATE) {
        ws.send(chunk);
      }
    },
    closeSocket: (code, reason) => {
      ws.close(code, reason);
    },
  });

  manager.handleOpen();

  ws.on("message", (data: Buffer | ArrayBuffer | string) => {
    if (typeof data === "string") {
      manager.handleMessage(data);
      return;
    }
    if (data instanceof ArrayBuffer) {
      manager.handleMessage(data);
      return;
    }
    manager.handleMessage(data.buffer.slice(0) as ArrayBuffer);
  });

  ws.on("close", (code: number, reason: Buffer) => {
    manager.handleClose(code, reason?.toString());
  });

  ws.on("error", (error: Error) => {
    manager.handleClose(1011, error.message);
  });

  return manager;
}
