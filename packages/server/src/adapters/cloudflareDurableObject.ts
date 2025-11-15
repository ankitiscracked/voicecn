/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createVoiceSession,
  DeclarativeVoiceSessionOptions,
  VoiceSessionProviders,
  type DeclarativeVoiceSession,
} from "../session/declarativeVoiceSession";
import type {
  AgentProcessor,
  TranscriptionProvider,
  SpeechProvider,
} from "../types";

export interface CloudflareDurableObjectState {
  acceptWebSocket: (ws: CloudflareWebSocket) => void;
  getWebSockets: () => CloudflareWebSocket[];
}

export interface CloudflareWebSocket extends WebSocket {
  serializeAttachment(data: any): void;
  deserializeAttachment(): any;
  accept(): void;
}

export interface CloudflareEnv {}

type CloudflareResponseInit = ResponseInit & { webSocket?: WebSocket };

export interface CloudflareSessionFactory<Env extends CloudflareEnv> {
  transcription: (env: Env) => TranscriptionProvider;
  agent: (env: Env) => AgentProcessor;
  speech: (env: Env) => SpeechProvider;
}

export function createVoiceDurableObject<Env extends CloudflareEnv>(
  providers: CloudflareSessionFactory<Env>
) {
  return class VoiceDurableObject {
    // Internal session tracking for the currently connected user.
    session: DeclarativeVoiceSession | null = null;

    constructor(
      readonly state: CloudflareDurableObjectState,
      readonly env: Env
    ) {
      for (const socket of this.state.getWebSockets()) {
        const attachment = socket.deserializeAttachment();
        if (attachment?.userId) {
          this.session = this.createSession(
            socket as CloudflareWebSocket,
            attachment.userId
          );
        }
      }
    }

    async fetch(request: Request): Promise<Response> {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }

      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const userHeader = request.headers.get("X-Voice-User");
      if (!userHeader) {
        return new Response("Missing user context", { status: 400 });
      }

      const user = JSON.parse(userHeader) as { id?: string };
      if (!user.id) {
        return new Response("Unauthorized voice session", { status: 401 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [
        CloudflareWebSocket,
        CloudflareWebSocket
      ];

      this.session = this.createSession(server, user.id);
      server.serializeAttachment({ userId: user.id });
      this.state.acceptWebSocket(server);
      this.session.handleOpen();

      const responseInit: CloudflareResponseInit = {
        status: 101,
        webSocket: client,
      };

      return new Response(null, responseInit);
    }

    async webSocketMessage(
      ws: CloudflareWebSocket,
      message: string | ArrayBuffer
    ) {
      this.ensureSession(ws);
      await this.session?.handleMessage(message);
    }

    async webSocketClose(
      ws: CloudflareWebSocket,
      code: number,
      reason: string
    ) {
      this.ensureSession(ws);
      this.session?.handleClose(code, reason);
      this.session = null;
    }

    async webSocketError(ws: CloudflareWebSocket, error: unknown) {
      this.ensureSession(ws);
      const message =
        error instanceof Error ? error.message : "WebSocket error";
      this.session?.handleClose(1011, message);
      this.session = null;
    }

    createSession(ws: CloudflareWebSocket, userId: string) {
      const sessionProviders = {
        transcription: providers.transcription(this.env),
        agent: providers.agent(this.env),
        speech: providers.speech(this.env),
      };
      return createVoiceSession({
        userId,
        providers: sessionProviders,
        transport: {
          sendJson: (payload) => {
            ws.send(JSON.stringify(payload));
          },
          sendBinary: (chunk) => ws.send(chunk),
          close: (code, reason) => ws.close(code, reason),
        },
      });
    }

    ensureSession(ws: CloudflareWebSocket) {
      if (this.session) {
        return;
      }
      const attachment = ws.deserializeAttachment();
      if (!attachment?.userId) {
        ws.close(1011, "missing voice session context");
        return;
      }
      this.session = this.createSession(ws, attachment.userId);
    }
  };
}

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};
