import { useEffect, useMemo, useState } from "react";
import { useVoice, useAudio } from "@usevoiceai/react";
import { DemoWebSocket } from "./mockServerSocket";

const wsUrl = import.meta.env.VITE_USEVOICEAI_WS_URL;
const forceMock = import.meta.env.VITE_USEVOICEAI_USE_MOCK === "1";
const useMockSocket = forceMock || !wsUrl;

export default function App() {
  const [autoDemo, setAutoDemo] = useState(false);
  const audio = useAudio();

  const socketOptions = useMemo(() => {
    if (useMockSocket) {
      return {
        url: "ws://demo.local",
        WebSocketImpl: DemoWebSocket,
      };
    }

    return {
      url: wsUrl as string,
    };
  }, [useMockSocket, wsUrl]);

  const {
    status,
    startRecording,
    stopRecording,
    results,
    audioStream,
    isAudioPlaying,
  } = useVoice({
    socketOptions,
  });

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

  const handleToggle = async () => {
    if (status.stage === "recording") {
      stopRecording();
      return;
    }

    if (useMockSocket) {
      setAutoDemo(true);
      await startRecording();
      setTimeout(() => {
        stopRecording();
        setAutoDemo(false);
      }, 1000);
      return;
    }

    await startRecording();
  };

  const latestResult = results.length > 0 ? results[results.length - 1] : null;

  // Determine which animation to show
  const isRecording = status.stage === "recording";
  const isProcessing =
    status.stage === "processing" || status.stage === "transcribing";
  const isPlaying = isAudioPlaying;

  return (
    <div className="p-6 w-1/2 mx-auto border border-stone-200 rounded-md mt-24">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Status Display Area */}
        <div className="bg-white rounded-lg shadow-sm p-8 min-h-[200px] flex items-center justify-center">
          {/* Recording Animation */}
          {isRecording && (
            <div className="flex items-center flex-col gap-8">
              <div className="relative">
                <div className="w-20 h-20 bg-red-400 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 w-20 h-20 bg-red-400 rounded-full animate-ping opacity-75"></div>
              </div>
              {status.transcript && (
                <p className="text-xl font-medium text-stone-800 leading-relaxed">
                  {status.transcript}
                </p>
              )}
            </div>
          )}

          {/* Processing Animation */}
          {isProcessing && !isRecording && (
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              ></div>
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></div>
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></div>
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "450ms" }}
              ></div>
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "600ms" }}
              ></div>
            </div>
          )}

          {/* TTS Playing Animation */}
          {isPlaying && !isRecording && !isProcessing && (
            <div className="flex items-end justify-center gap-1.5 h-20">
              <div
                className="w-2 bg-stone-500 rounded-full sound-wave-bar"
                style={{ height: "20px" }}
              ></div>
              <div
                className="w-2 bg-stone-500 rounded-full sound-wave-bar"
                style={{ height: "40px" }}
              ></div>
              <div
                className="w-2 bg-stone-500 rounded-full sound-wave-bar"
                style={{ height: "60px" }}
              ></div>
              <div
                className="w-2 bg-stone-500 rounded-full sound-wave-bar"
                style={{ height: "40px" }}
              ></div>
              <div
                className="w-2 bg-stone-500 rounded-full sound-wave-bar"
                style={{ height: "20px" }}
              ></div>
            </div>
          )}

          {/* Idle State */}
          {!isRecording && !isProcessing && !isPlaying && (
            <div className="text-stone-500 text-lg font-semibold">
              Start recording
            </div>
          )}
        </div>

        {/* Response Section */}
        {latestResult && (
          <div className="space-y-2 flex flex-col items-center">
            <div className="text-sm font-semibold text-stone-500 tracking-wide">
              Response
            </div>
            <p className="text-gray-900 leading-relaxed overflow-y-auto max-h-60 border border-stone-200 rounded-md p-2">
              {latestResult.data?.formattedContent?.content as string}
            </p>
          </div>
        )}

        {/* Control Button */}
        <div className="flex justify-center pt-4">
          <button
            onClick={handleToggle}
            disabled={isPlaying || isProcessing}
            className={`flex items-center gap-2 px-6 py-3 border-[1.5px] border-stone-500 rounded-md hover:bg-stone-200 transition-colors font-medium text-base ${
              isPlaying || isProcessing ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isRecording ? (
              <>
                <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                <span>Stop</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>Record</span>
              </>
            )}
          </button>
        </div>

        {/* Debug Info */}
        {autoDemo && (
          <div className="text-center text-xs text-gray-500">Simulating...</div>
        )}
      </div>
    </div>
  );
}
