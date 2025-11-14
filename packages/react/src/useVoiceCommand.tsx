import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  VoiceCommandResult,
  type VoiceSocketClientOptions,
  type VoiceCommandStatus,
  type VoiceAudioStream,
  VoiceSocketClient,
  VoiceCommandStateStore,
} from "@usevoice/core";
import { createVoiceCommandBridge } from "./createVoiceCommandBridge";

export interface UseVoiceCommandOptions {
  socket?: VoiceSocketClient;
  socketOptions?: VoiceSocketClientOptions;
  mediaDevices?: MediaDevices;
  notifications?: {
    success?: (message: string) => void;
    error?: (message: string) => void;
  };
  state?: VoiceCommandStateStore;
}

export interface UseVoiceCommandResult {
  status: VoiceCommandStatus;
  results: VoiceCommandResult[];
  queryResponse: VoiceCommandResult | null;
  audioStream: VoiceAudioStream | null;
  isAudioPlaying: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => Promise<void>;
  recorderStream: MediaStream | null;
}

export function useVoiceCommand(
  options: UseVoiceCommandOptions = {}
): UseVoiceCommandResult {
  // Keep useMemo for bridge since it has side effects and manages subscriptions
  const bridge = useMemo(
    () =>
      createVoiceCommandBridge({
        socket: options.socket,
        socketOptions: options.socketOptions,
        state: options.state,
        mediaDevices: options.mediaDevices,
        notifications: options.notifications,
      }),
    [
      options.socket,
      options.socketOptions,
      options.state,
      options.mediaDevices,
      options.notifications?.success,
      options.notifications?.error,
    ]
  );

  const store = bridge.store;

  const status = useSyncExternalStore(
    (callback) => store.subscribe(callback),
    () => store.getStatus()
  );

  console.log("reactive status", status);

  const results = useSyncExternalStore(
    (callback) => store.subscribeResults(callback),
    () => store.getResults()
  );
  const audioStream = useSyncExternalStore(
    (callback) => store.subscribeAudioStream(callback),
    () => store.getAudioStream()
  );
  const isAudioPlaying = useSyncExternalStore(
    (callback) => store.subscribePlayback(callback),
    () => store.isAudioPlaying()
  );

  const [queryResponse, setQueryResponse] = useState<VoiceCommandResult | null>(
    bridge.getQueryResponse()
  );

  useEffect(() => {
    const unsubQuery = bridge.subscribeQueryResponse(setQueryResponse);
    return () => unsubQuery();
  }, [bridge]);

  useEffect(() => {
    bridge.init();
    return () => bridge.destroy();
  }, [bridge]);

  const startRecording = async () => {
    await bridge.controller.startRecording();
  };

  const stopRecording = () => {
    bridge.controller.stopRecording();
  };

  const cancelRecording = async () => {
    await bridge.controller.cancelRecording();
  };

  return {
    status,
    results,
    queryResponse,
    audioStream,
    isAudioPlaying,
    startRecording,
    stopRecording,
    cancelRecording,
    recorderStream: bridge.controller.getRecorderStream(),
  };
}
