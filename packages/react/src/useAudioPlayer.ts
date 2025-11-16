import { useEffect, useMemo } from "react";

const AudioContextClass: typeof AudioContext | undefined =
  typeof window !== "undefined"
    ? window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext
    : undefined;

export interface AudioPlayer {
  start: () => Promise<void>;
  addChunk: (chunk: ArrayBuffer) => Promise<number | null>;
  finish: (errored?: boolean) => void;
  reset: () => void;
  waitUntilIdle: () => Promise<void>;
  getAudioContext: () => AudioContext | null;
  getAnalyser: () => Promise<AnalyserNode | null>;
}

export function useAudioPlayer(): AudioPlayer {
  const player = useMemo(() => createTtsPlayer(), []);
  useEffect(() => () => player.reset(), [player]);
  return player;
}

function createTtsPlayer(): AudioPlayer {
  let audioContext: AudioContext | null = null;
  const activeSources = new Set<AudioBufferSourceNode>();
  let playbackCursor = 0;
  let currentSampleRate = 48_000;
  let lastSampleValue: number | null = null;
  const idleResolvers: Array<() => void> = [];
  let outputGain: GainNode | null = null;
  let analyserNode: AnalyserNode | null = null;
  let analyserConnected = false;

  const ensureContext = async (): Promise<AudioContext | null> => {
    if (!AudioContextClass) {
      console.warn("Web Audio API is unavailable; skipping TTS playback.");
      return null;
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch (error) {
        console.warn("Failed to resume audio context:", error);
      }
    }

    ensureOutputNode(audioContext);

    return audioContext;
  };

  const ensureOutputNode = (ctx: AudioContext) => {
    if (!outputGain) {
      outputGain = ctx.createGain();
      outputGain.connect(ctx.destination);
    }
    return outputGain;
  };

  const ensureAnalyser = async (): Promise<AnalyserNode | null> => {
    const ctx = await ensureContext();
    if (!ctx) {
      return null;
    }

    const output = ensureOutputNode(ctx);

    if (!analyserNode) {
      analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.8;
    }

    if (!analyserConnected && output && analyserNode) {
      try {
        output.connect(analyserNode);
        analyserConnected = true;
      } catch {
        // Some browsers throw if connecting twice; ignore.
      }
    }

    return analyserNode;
  };

  const notifyIdle = () => {
    if (activeSources.size === 0) {
      while (idleResolvers.length > 0) {
        const resolve = idleResolvers.pop();
        resolve?.();
      }
    }
  };

  const stopAllSources = () => {
    for (const source of activeSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        /* ignore */
      }
    }
    activeSources.clear();
  };

  const resetState = () => {
    stopAllSources();
    if (audioContext) {
      playbackCursor = audioContext.currentTime;
    } else {
      playbackCursor = 0;
    }
    lastSampleValue = null;
  };

  const start = async () => {
    const ctx = await ensureContext();
    if (!ctx) {
      return;
    }

    resetState();
  };

  const scheduleBuffer = (buffer: AudioBuffer) => {
    if (!audioContext) {
      return;
    }

    const output = ensureOutputNode(audioContext);
    const startAt = Math.max(playbackCursor, audioContext.currentTime);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(output ?? audioContext.destination);
    source.onended = () => {
      activeSources.delete(source);
      notifyIdle();
    };

    try {
      source.start(startAt);
      playbackCursor = startAt + buffer.duration;
      activeSources.add(source);
      notifyIdle();
    } catch (error) {
      console.error("Failed to start TTS audio buffer:", error);
    }
  };

  const addChunk = async (chunk: ArrayBuffer): Promise<number | null> => {
    const ctx = await ensureContext();
    if (!ctx) {
      return null;
    }

    if (chunk.byteLength === 0) {
      return null;
    }

    const result = createBufferFromPcm16(
      ctx,
      chunk,
      currentSampleRate,
      lastSampleValue ?? undefined
    );

    if (!result) {
      return null;
    }

    lastSampleValue = result.lastSample;
    scheduleBuffer(result.buffer);
    return result.averageMagnitude;
  };

  const finish = (errored = false) => {
    if (errored) {
      reset();
    }
  };

  const reset = () => {
    resetState();
    notifyIdle();
  };

  const waitUntilIdle = () => {
    if (activeSources.size === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      idleResolvers.push(resolve);
    });
  };

  return {
    start,
    addChunk,
    finish,
    reset,
    waitUntilIdle,
    getAudioContext: () => audioContext,
    getAnalyser: ensureAnalyser,
  };
}

function createBufferFromPcm16(
  ctx: AudioContext,
  buffer: ArrayBuffer,
  sampleRate: number,
  previousSample?: number
): {
  buffer: AudioBuffer;
  lastSample: number;
  averageMagnitude: number;
} | null {
  if (buffer.byteLength === 0) {
    return null;
  }

  const frameCount = Math.floor(buffer.byteLength / 2);
  if (frameCount === 0) {
    return null;
  }

  const audioBuffer = ctx.createBuffer(1, frameCount, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  const view = new DataView(buffer);
  let sum = 0;

  for (let i = 0; i < frameCount; i++) {
    const sample = view.getInt16(i * 2, true);
    channelData[i] = sample / 32_768;
    sum += Math.abs(channelData[i]);
  }

  if (previousSample !== undefined && frameCount > 0) {
    const fadeSamples = Math.min(32, frameCount);
    const initial = previousSample;
    for (let i = 0; i < fadeSamples; i++) {
      const mix = (i + 1) / fadeSamples;
      channelData[i] = channelData[i] * mix + initial * (1 - mix);
    }
  }

  const lastSample = channelData[frameCount - 1];
  const averageMagnitude =
    frameCount > 0 ? Math.min(1, Math.max(0, sum / frameCount)) : 0;

  return {
    buffer: audioBuffer,
    lastSample,
    averageMagnitude,
  };
}
