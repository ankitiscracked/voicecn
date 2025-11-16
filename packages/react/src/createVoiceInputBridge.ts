import {
  VoiceInputController,
  VoiceInputResult,
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

  return {
    store,
    controller,
    socket,
    init() {
      controller.init();
    },
    destroy() {
      controller.destroy();
      if (!options.socket) {
        socket.close();
      }
    },
  };
}
