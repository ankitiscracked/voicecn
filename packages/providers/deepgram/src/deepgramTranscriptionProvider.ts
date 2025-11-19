import { DeepgramClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import type {
  TranscriptionProvider,
  TranscriptionStream,
} from "@usevoiceai/server";

const DeepgramEvents = {
  Open: LiveTranscriptionEvents.Open,
  Transcript: LiveTranscriptionEvents.Transcript,
  Close: LiveTranscriptionEvents.Close,
  Error: LiveTranscriptionEvents.Error,
  SpeechStarted: LiveTranscriptionEvents.SpeechStarted,
  UtteranceEnd: LiveTranscriptionEvents.UtteranceEnd,
} as const;

type DeepgramLiveStream = {
  on: (event: string, handler: (payload?: any) => void) => void;
  send: (chunk: ArrayBuffer) => void;
  keepAlive: () => void;
  finalize: () => void;
  requestClose: () => void;
};

type DeepgramClientLike = {
  listen: {
    live: (options: Record<string, unknown>) => DeepgramLiveStream;
  };
};

export interface DeepgramProviderConfig {
  apiKey?: string;
  modelId: string;
  keepAliveIntervalMs?: number;
  defaultEncoding?: string;
  defaultSampleRate?: number;
  defaultChannels?: number;
  clientFactory?: () => DeepgramClientLike;
}

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly keepAliveIntervalMs: number;
  private readonly defaultEncoding: string;
  private readonly defaultSampleRate: number;
  private readonly defaultChannels: number;
  private readonly clientFactory: () => DeepgramClientLike;

  constructor(config: DeepgramProviderConfig) {
    let apiKey = config.apiKey;
    if (!apiKey) {
      if (typeof process !== "undefined") {
        apiKey = process.env.DEEPGRAM_API_KEY ?? "";
      }
    }
    if (!apiKey) {
      throw new Error("DeepgramTranscriptionProvider requires an apiKey");
    }
    this.apiKey = apiKey;
    this.modelId = config.modelId;
    this.keepAliveIntervalMs = config.keepAliveIntervalMs ?? 3000;
    this.defaultEncoding = config.defaultEncoding ?? "opus";
    this.defaultSampleRate = config.defaultSampleRate ?? 48_000;
    this.defaultChannels = config.defaultChannels ?? 1;
    this.clientFactory =
      config.clientFactory ??
      (() =>
        new DeepgramClient({ key: this.apiKey }) as unknown as DeepgramClientLike);
  }

  async createStream({
    onTranscript,
    onError,
    onClose,
    onSpeechEnd,
    onSpeechStart,
    speechEndDetection,
  }: Parameters<
    TranscriptionProvider["createStream"]
  >[0]): Promise<TranscriptionStream> {
    const client = this.clientFactory();
    const detectionOptions = (speechEndDetection?.options ??
      {}) as Record<string, unknown>;

    const coerceMs = (value: unknown) => {
      if (typeof value === "number") {
        return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0
          ? Math.round(parsed)
          : null;
      }
      return null;
    };

    const utteranceEndMs =
      coerceMs(
        detectionOptions.utteranceEndMs ??
          detectionOptions.utterance_end_ms ??
          detectionOptions.gapMs ??
          detectionOptions.silenceMs
      ) ?? 1200;
    const endpointingMs = coerceMs(
      detectionOptions.endpointing ??
        detectionOptions.endpointingMs ??
        detectionOptions.endpointing_ms
    );
    const vadEventsEnabled =
      typeof detectionOptions.vadEvents === "boolean"
        ? detectionOptions.vadEvents
        : typeof detectionOptions.vad_events === "boolean"
          ? (detectionOptions.vad_events as boolean)
          : true;

    const streamOptions: Record<string, unknown> = {
      model: this.modelId,
      punctuate: true,
      interim_results: true,
      encoding: this.defaultEncoding,
      sampleRate: this.defaultSampleRate,
      channels: this.defaultChannels,
    };

    if (speechEndDetection?.mode === "auto") {
      streamOptions.utterance_end_ms = String(utteranceEndMs);
      streamOptions.vad_events = vadEventsEnabled;
      if (endpointingMs) {
        streamOptions.endpointing = endpointingMs;
      }
    }

    const stream = client.listen.live(streamOptions);

    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    let isOpen = false;
    const pending: ArrayBuffer[] = [];
    let finishResolve: (() => void) | null = null;
    let finishReject: ((error: Error) => void) | null = null;
    let finishSettled = false;

    const finishPromise = new Promise<void>((resolve, reject) => {
      finishResolve = resolve;
      finishReject = reject;
    });
    const autoStopEnabled = speechEndDetection?.mode === "auto";
    let speechEndHinted = false;

    const settleFinish = (error?: Error) => {
      if (finishSettled) {
        return;
      }
      finishSettled = true;
      if (error) {
        finishReject?.(error);
      } else {
        finishResolve?.();
      }
    };

    const clearKeepAlive = () => {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    };

    const toArrayBuffer = (chunk: ArrayBuffer | ArrayBufferView) => {
      if (chunk instanceof ArrayBuffer) {
        return chunk;
      }
      const view = chunk as ArrayBufferView;
      const copied = new ArrayBuffer(view.byteLength);
      new Uint8Array(copied).set(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      );
      return copied;
    };

    stream.on(DeepgramEvents.Open, () => {
      isOpen = true;
      for (const chunk of pending.splice(0, pending.length)) {
        try {
          stream.send(chunk);
        } catch (error) {
          console.warn("Failed to flush Deepgram chunk", error);
        }
      }
      keepAliveTimer = setInterval(() => {
        try {
          stream.keepAlive();
        } catch (error) {
          console.warn("Deepgram keepAlive failed", error);
        }
      }, this.keepAliveIntervalMs);
    });

    stream.on(DeepgramEvents.Transcript, (data: any) => {
      const alternative = data?.channel?.alternatives?.[0];
      const transcript = alternative?.transcript as string | undefined;
      if (!transcript) return;
      onTranscript({
        transcript,
        isFinal: Boolean(data?.is_final),
      });
      if (
        autoStopEnabled &&
        !speechEndHinted &&
        (data?.speech_final === true || data?.is_final === true)
      ) {
        speechEndHinted = true;
        onSpeechEnd?.({
          reason: data?.speech_final ? "speech_final" : "is_final",
          providerPayload: data,
        });
      }
    });

    stream.on(DeepgramEvents.UtteranceEnd, (data: any) => {
      if (!autoStopEnabled || speechEndHinted) {
        return;
      }
      speechEndHinted = true;
      onSpeechEnd?.({
        reason: "utterance_end",
        providerPayload: data,
      });
    });

    stream.on(DeepgramEvents.SpeechStarted, (data: any) => {
      if (!autoStopEnabled) {
        return;
      }
      onSpeechStart?.({
        reason: "speech_started",
        providerPayload: data,
        timestampMs:
          typeof data?.timestamp === "number"
            ? Math.round(data.timestamp * 1000)
            : undefined,
      });
    });

    stream.on(DeepgramEvents.Close, () => {
      isOpen = false;
      clearKeepAlive();
      settleFinish();
      onClose?.();
    });

    stream.on(DeepgramEvents.Error, (cause: unknown) => {
      isOpen = false;
      pending.length = 0;
      clearKeepAlive();
      const error =
        cause instanceof Error
          ? cause
          : new Error(
              typeof cause === "string"
                ? cause
                : "Deepgram live transcription error"
            );
      settleFinish(error);
      onError?.(error);
    });

    return {
      send: (chunk) => {
        if (!isOpen) {
          pending.push(toArrayBuffer(chunk));
          return;
        }
        try {
          stream.send(toArrayBuffer(chunk));
        } catch (error) {
          console.warn("Failed to send Deepgram chunk", error);
        }
      },
      finish: async () => {
        isOpen = false;
        clearKeepAlive();
        stream.finalize();
        stream.requestClose();
        await finishPromise;
      },
      abort: (reason?: string) => {
        isOpen = false;
        pending.length = 0;
        clearKeepAlive();
        stream.requestClose();
        settleFinish(
          reason ? new Error(reason) : new Error("transcription aborted")
        );
      },
    };
  }
}
