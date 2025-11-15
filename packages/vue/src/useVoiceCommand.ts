import { onBeforeUnmount, shallowRef, readonly } from "vue";
import {
  VoiceCommandResult,
  VoiceCommandStateStore,
  type VoiceCommandStatus,
  type VoiceSocketClientOptions
} from "@usevoiceai/core";
import { createVoiceCommandBridge } from "./createVoiceCommandBridge";

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
  const bridge = createVoiceCommandBridge({
    socket: options.socket,
    socketOptions: options.socketOptions,
    state: options.state,
    mediaDevices: options.mediaDevices,
    notifications: options.notifications
  });

  const store = bridge.store;
  const controller = bridge.controller;

  const status = shallowRef<VoiceCommandStatus>(store.getStatus());
  const results = shallowRef<VoiceCommandResult[]>(store.getResults());
  const queryResponse = shallowRef<VoiceCommandResult | null>(
    bridge.getQueryResponse()
  );
  const audioStream = shallowRef(store.getAudioStream());
  const isAudioPlaying = shallowRef(store.isAudioPlaying());

  const unsubStatus = store.subscribe((next) => {
    status.value = next;
  });
  const unsubResults = store.subscribeResults((next) => {
    results.value = next;
  });
  const unsubAudio = store.subscribeAudioStream((stream) => {
    audioStream.value = stream;
  });
  const unsubPlayback = store.subscribePlayback((playing) => {
    isAudioPlaying.value = playing;
  });

  const unsubQuery = bridge.subscribeQueryResponse((result) => {
    queryResponse.value = result;
  });

  onBeforeUnmount(() => {
    unsubStatus();
    unsubResults();
    unsubAudio();
    unsubPlayback();
    unsubQuery();
    bridge.destroy();
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
