import { useEffect } from "react";
import { useAudioPlayer } from "./useAudioPlayer";
import { VoiceAudioStream } from "@usevoiceai/core";

export function useAudio({
  audioStream,
}: {
  audioStream: VoiceAudioStream | null;
}) {
  const audio = useAudioPlayer();

  useEffect(() => {
    if (!audioStream) {
      return;
    }
    let isCancelled = false;
    const stream = audioStream;
    const iterator = stream[Symbol.asyncIterator]();
    let hasReleased = false;
    const releaseStream = () => {
      if (hasReleased) {
        return;
      }
      hasReleased = true;
      stream.release?.();
    };

    (async () => {
      try {
        await audio.start();
        while (!isCancelled) {
          const { value, done } = await iterator.next();
          if (done || !value) {
            break;
          }
          const magnitude = await audio.addChunk(value);
          if (typeof magnitude === "number") {
          }
        }
        audio.finish();
        await audio.waitUntilIdle();
        if (!isCancelled) {
        }
      } catch (error) {
        console.warn("Unable to play TTS audio", error);
        audio.finish(true);
      } finally {
        releaseStream();
      }
    })();

    return () => {
      isCancelled = true;
      iterator.return?.();
      releaseStream();
      audio.reset();
    };
  }, [audioStream, audio]);

  return {
    stop: audio.reset,
  };
}
