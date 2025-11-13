import { onBeforeUnmount, shallowRef, readonly } from "vue";
import {
  VoiceCommandController,
  VoiceCommandResult,
  VoiceCommandStateStore,
  VoiceSocketClient,
  type VoiceCommandStatus,
  type VoiceSocketClientOptions
} from "@usevoice/core";

export interface UseVoiceCommandOptions {
  socket?: VoiceSocketClient;
  socketOptions?: VoiceSocketClientOptions;
  state?: VoiceCommandStateStore;
  mediaDevices?: MediaDevices;
  notifications?: {
    success?: (message: string) => void;
    error?: (message: string) => void;
  };
}

export function useVoiceCommand(options: UseVoiceCommandOptions = {}) {
  const store = options.state ?? new VoiceCommandStateStore();
  const socket =
    options.socket ??
    new VoiceSocketClient({
      ...(options.socketOptions ?? {})
    });

  const controller = new VoiceCommandController({
    socket,
    state: store,
    mediaDevices: options.mediaDevices,
    notifications: options.notifications
  });

  const status = shallowRef<VoiceCommandStatus>(store.getStatus());
  const results = shallowRef<VoiceCommandResult[]>(store.getResults());
  const queryResponse = shallowRef<VoiceCommandResult | null>(
    controller.getQueryResponse()
  );
  const audioStream = shallowRef(store.getAudioStream());
  const isAudioPlaying = shallowRef(store.isAudioPlaying());

  const unsubStatus = store.subscribe((next) => {
    status.value = next;
  });
  const unsubResults = store.subscribeResults((next) => {
    results.value = next;
    const latest = next.find((item) => item.data?.intent === "fetch") ?? null;
    if (latest) {
      queryResponse.value = latest;
    }
  });
  const unsubAudio = store.subscribeAudioStream((stream) => {
    audioStream.value = stream;
  });
  const unsubPlayback = store.subscribePlayback((playing) => {
    isAudioPlaying.value = playing;
  });

  onBeforeUnmount(() => {
    unsubStatus();
    unsubResults();
    unsubAudio();
    unsubPlayback();
    controller.destroy();
  });

  const startRecording = async () => controller.startRecording();
  const stopRecording = () => controller.stopRecording();
  const cancelRecording = async () => controller.cancelRecording();

  return {
    status: readonly(status),
    results: readonly(results),
    queryResponse: readonly(queryResponse),
    audioStream: readonly(audioStream),
    isAudioPlaying: readonly(isAudioPlaying),
    startRecording,
    stopRecording,
    cancelRecording,
    recorderStream: controller.getRecorderStream()
  };
}
