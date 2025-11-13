import { useEffect, useMemo, useState, useCallback } from "react";
import {
  VoiceCommandController,
  VoiceCommandResult,
  VoiceCommandStateStore,
  VoiceSocketClient,
  type VoiceSocketClientOptions,
  type VoiceCommandStatus,
  type VoiceAudioStream
} from "@usevoice/core";

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
  const store = useMemo(
    () => options.state ?? new VoiceCommandStateStore(),
    [options.state]
  );
  const socket = useMemo(
    () =>
      options.socket ??
      new VoiceSocketClient({
        ...(options.socketOptions ?? {})
      }),
    [options.socket, options.socketOptions]
  );

  const controller = useMemo(() => {
    return new VoiceCommandController({
      socket,
      state: store,
      notifications: options.notifications,
      mediaDevices: options.mediaDevices
    });
  }, [
    socket,
    store,
    options.mediaDevices,
    options.notifications?.success,
    options.notifications?.error
  ]);

  const [status, setStatus] = useState<VoiceCommandStatus>(store.getStatus());
  const [results, setResults] = useState<VoiceCommandResult[]>(store.getResults());
  const [queryResponse, setQueryResponse] = useState<VoiceCommandResult | null>(
    controller.getQueryResponse()
  );
  const [audioStream, setAudioStream] = useState<VoiceAudioStream | null>(
    store.getAudioStream()
  );
  const [isAudioPlaying, setAudioPlaying] = useState<boolean>(
    store.isAudioPlaying()
  );

  useEffect(() => {
    const unsubStatus = store.subscribe(setStatus);
    const unsubResults = store.subscribeResults((next) => {
      setResults(next);
      const latest = next.find(
        (item) => item.data?.intent === "fetch"
      );
      if (latest) {
        setQueryResponse(latest);
      }
    });
    const unsubAudio = store.subscribeAudioStream(setAudioStream);
    const unsubPlayback = store.subscribePlayback(setAudioPlaying);
    return () => {
      unsubStatus();
      unsubResults();
      unsubAudio();
      unsubPlayback();
    };
  }, [store]);

  useEffect(() => {
    setQueryResponse(controller.getQueryResponse());
  }, [controller]);

  useEffect(() => () => controller.destroy(), [controller]);

  const startRecording = useCallback(async () => {
    await controller.startRecording();
  }, [controller]);

  const stopRecording = useCallback(() => {
    controller.stopRecording();
  }, [controller]);

  const cancelRecording = useCallback(async () => {
    await controller.cancelRecording();
  }, [controller]);

  return {
    status,
    results,
    queryResponse,
    audioStream,
    isAudioPlaying,
    startRecording,
    stopRecording,
    cancelRecording,
    recorderStream: controller.getRecorderStream()
  };
}
