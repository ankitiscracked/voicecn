import { useMemo, useState } from "react";
import type { SpeechEndDetectionConfig } from "@usevoiceai/core";
import { useAudio, useVoice } from "@usevoiceai/react";
import { DemoWebSocket } from "../mockServerSocket";

const wsUrl = import.meta.env.VITE_USEVOICEAI_WS_URL;
const forceMock =
  import.meta.env.VITE_USEVOICEAI_USE_MOCK === "1" ||
  import.meta.env.VITE_USEVOICEAI_USE_MOCK === "true";
const useMockSocket = forceMock || !wsUrl;

export interface VoiceDemoProps {
  title: string;
  description: string;
  speechEndDetection?: SpeechEndDetectionConfig;
  highlight?: string;
}

export function VoiceDemo({
  title,
  description,
  speechEndDetection,
  highlight,
}: VoiceDemoProps) {
  const [autoDemo, setAutoDemo] = useState(false);

  const socketOptions = useMemo(() => {
    if (useMockSocket) {
      return {
        url: "ws://demo.local",
        WebSocketImpl: DemoWebSocket as unknown as WebSocket,
      };
    }

    return {
      url: wsUrl as string,
    };
  }, []);

  const {
    status,
    startRecording,
    stopRecording,
    cancelRecording,
    results,
    audioStream,
    isAudioPlaying,
    isRecording,
  } = useVoice({
    socketOptions,
    speechEndDetection,
  });

  useAudio({ audioStream });

  const isProcessing = status.stage === "processing";
  const isError = status.stage === "error";
  const isPlaying = isAudioPlaying;

  const isAutoMode = speechEndDetection?.mode === "auto";
  const autoSessionActive = isAutoMode && status.stage !== "idle";
  const showStop = (isAutoMode && autoSessionActive) || isRecording;
  const disableButton = showStop ? false : isProcessing || isPlaying;

  const handleToggle = async () => {
    if (showStop && isAutoMode) {
      await cancelRecording();
      return;
    }

    if (isRecording) {
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

  const latestResult = results.length > 0 ? results[0] : null;

  return (
    <div className="space-y-6">
      <header className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold text-stone-900">{title}</h1>
        <p className="text-stone-600 max-w-2xl mx-auto">{description}</p>
        {highlight && (
          <div className="inline-flex px-3 py-1 rounded-full bg-stone-100 text-sm font-medium text-stone-700">
            {highlight}
          </div>
        )}
      </header>

      <div className="p-6 w-full max-w-3xl mx-auto border border-stone-200 rounded-xl bg-white shadow-sm">
        <div className="space-y-6">
          <div className="bg-stone-50 rounded-lg p-8 min-h-[220px] flex items-center justify-center border border-stone-100">
            {isRecording && !isProcessing && !isPlaying && (
              <div className="flex items-center flex-col gap-8">
                <div className="relative">
                  <div className="w-20 h-20 bg-red-400 rounded-full animate-pulse"></div>
                  <div className="absolute inset-0 w-20 h-20 bg-red-400 rounded-full animate-ping opacity-75"></div>
                </div>
                {status.transcript && (
                  <p className="text-xl font-medium text-stone-800 leading-relaxed text-center">
                    {status.transcript}
                  </p>
                )}
              </div>
            )}

            {isProcessing && (
              <div className="flex items-center gap-2">
                {[0, 150, 300, 450, 600].map((delay) => (
                  <div
                    key={delay}
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  ></div>
                ))}
              </div>
            )}

            {isPlaying && (
              <div className="flex items-end justify-center gap-1.5 h-20">
                {[20, 40, 60, 40, 20].map((height, index) => (
                  <div
                    key={index}
                    className="w-2 bg-stone-500 rounded-full sound-wave-bar"
                    style={{ height: `${height}px` }}
                  ></div>
                ))}
              </div>
            )}

            {!isRecording && (
              <div className="text-stone-500 text-lg font-semibold">
                Tap record to start
              </div>
            )}
          </div>

          {latestResult && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-stone-500 tracking-wide">
                Response
              </div>
              <p className="text-gray-900 leading-relaxed overflow-y-auto max-h-60 border border-stone-200 rounded-md p-3 bg-stone-50">
                {(latestResult.data?.responseText as string) ?? ""}
              </p>
            </div>
          )}

          {isError && (
            <div className="text-center space-y-2">
              <div className="font-medium text-stone-500">Error</div>
              <p className="bg-red-50 p-2 rounded-md text-sm text-red-700 leading-relaxed overflow-y-auto max-h-60">
                {status.error}
              </p>
            </div>
          )}

          <div className="flex justify-center pt-4">
            <button
              onClick={handleToggle}
              disabled={disableButton}
              className={`flex items-center gap-2 px-6 py-3 border-[1.5px] border-stone-500 rounded-md hover:bg-stone-100 transition-colors font-medium text-base ${
                disableButton ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {showStop ? (
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

          {autoDemo && (
            <div className="text-center text-xs text-gray-500">
              Simulating mock session…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
