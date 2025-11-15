import {
  VoiceInputController,
  VoiceCommandResult,
  VoiceInputStore,
  VoiceSocketClient,
  type VoiceSocketClientOptions,
} from "@usevoiceai/core";

interface VoiceCommandBridgeOptions {
  socket?: VoiceSocketClient;
  socketOptions?: VoiceSocketClientOptions;
  state?: VoiceInputStore;
  mediaDevices?: MediaDevices;
  notifications?: {
    success?: (message: string) => void;
    error?: (message: string) => void;
  };
}

interface VoiceCommandBridge {
  init(): void;
  store: VoiceInputStore;
  controller: VoiceInputController;
  socket: VoiceSocketClient;
  getQueryResponse(): VoiceCommandResult | null;
  subscribeQueryResponse(
    handler: (result: VoiceCommandResult | null) => void
  ): () => void;
  destroy(): void;
}

export function createVoiceInputBridge(
  options: VoiceCommandBridgeOptions = {}
): VoiceCommandBridge {
  const store = options.state ?? new VoiceInputStore();
  const socket =
    options.socket ??
    new VoiceSocketClient({ ...(options.socketOptions ?? {}) });

  const controller = new VoiceInputController({
    socket,
    store,
    notifications: options.notifications,
    mediaDevices: options.mediaDevices,
  });

  let queryResponse: VoiceCommandResult | null =
    store.getResults().find((item) => item.data?.intent === "fetch") ?? null;
  const queryHandlers = new Set<(result: VoiceCommandResult | null) => void>();

  const notifyQueryHandlers = () => {
    queryHandlers.forEach((handler) => handler(queryResponse));
  };

  const unsubscribeResults = store.subscribeResults((next) => {
    const latest = next.find((item) => item.data?.intent === "fetch") ?? null;
    if (latest !== queryResponse) {
      queryResponse = latest;
      notifyQueryHandlers();
    }
  });

  return {
    store,
    controller,
    socket,
    getQueryResponse: () => queryResponse,
    subscribeQueryResponse(handler) {
      queryHandlers.add(handler);
      handler(queryResponse);
      return () => {
        queryHandlers.delete(handler);
      };
    },
    init() {
      controller.init();
    },
    destroy() {
      unsubscribeResults();
      queryHandlers.clear();
      controller.destroy();
      if (!options.socket) {
        socket.close();
      }
    },
  };
}
