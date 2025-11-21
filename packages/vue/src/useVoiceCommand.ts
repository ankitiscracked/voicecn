import { onBeforeUnmount, shallowRef, readonly } from "vue";
import {
  VoiceInputResult,
  VoiceInputStore,
  type VoiceCommandStatus,
  type VoiceSocketClientOptions,
  VoiceSocketClient,
} from "@usevoiceai/core";
import { createVoiceCommandBridge } from "./createVoiceCommandBridge";

export interface UseVoiceCommandOptions {
  socket?: VoiceSocketClient;
  socketOptions?: VoiceSocketClientOptions;
  state?: VoiceInputStore;
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
  const results = shallowRef<VoiceInputResult[]>(store.getResults());
  const queryResponse = shallowRef<VoiceInputResult | null>(
    bridge.getQueryResponse()
  );
  const audioStream = shallowRef(store.getAudioStream());
  const isAudioPlaying = shallowRef(store.isAudioPlaying());
  const isRecording = shallowRef(store.isRecording());

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
  const unsubRecording = store.subscribeRecording((recording) => {
    isRecording.value = recording;
  });

  const unsubQuery = bridge.subscribeQueryResponse((result) => {
    queryResponse.value = result;
  });

  onBeforeUnmount(() => {
    unsubStatus();
    unsubResults();
    unsubAudio();
    unsubPlayback();
    unsubRecording();
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
    isRecording: readonly(isRecording),
    startRecording,
    stopRecording,
    cancelRecording,
    recorderStream: controller.getRecorderStream()
  };
}
