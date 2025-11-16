import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  VoiceInputResult,
  type VoiceSocketClientOptions,
  type VoiceCommandStatus,
  type VoiceAudioStream,
  VoiceSocketClient,
  VoiceInputStore,
} from "@usevoiceai/core";
import { createVoiceInputBridge } from "./createVoiceInputBridge";

export interface UseVoiceCommandOptions {
  socket?: VoiceSocketClient;
  socketOptions?: VoiceSocketClientOptions;
  mediaDevices?: MediaDevices;
  notifications?: {
    success?: (message: string) => void;
    error?: (message: string) => void;
  };
  state?: VoiceInputStore;
}

export interface UseVoiceCommandResult {
  status: VoiceCommandStatus;
  results: VoiceInputResult[];
  audioStream: VoiceAudioStream | null;
  isAudioPlaying: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => Promise<void>;
  recorderStream: MediaStream | null;
}

export function useVoice(
  options: UseVoiceCommandOptions = {}
): UseVoiceCommandResult {
  // Keep useMemo for bridge since it has side effects and manages subscriptions
  const bridge = useMemo(
    () =>
      createVoiceInputBridge({
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
  console.log("reactive results", results);
  const audioStream = useSyncExternalStore(
    (callback) => store.subscribeAudioStream(callback),
    () => store.getAudioStream()
  );
  const isAudioPlaying = useSyncExternalStore(
    (callback) => store.subscribePlayback(callback),
    () => store.isAudioPlaying()
  );

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
    audioStream,
    isAudioPlaying,
    startRecording,
    stopRecording,
    cancelRecording,
    recorderStream: bridge.controller.getRecorderStream(),
  };
}
