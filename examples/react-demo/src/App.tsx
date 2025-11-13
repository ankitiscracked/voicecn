import { useEffect, useMemo, useState } from "react";
import { useVoiceCommand, useTtsPlayer } from "@usevoice/react";
import { DemoWebSocket } from "./mockServerSocket";

const wsUrl = import.meta.env.VITE_USEVOICE_WS_URL;
const forceMock = import.meta.env.VITE_USEVOICE_USE_MOCK === "1";
const useMockSocket = forceMock || !wsUrl;

export default function App() {
  const [autoDemo, setAutoDemo] = useState(false);
  const [playbackLevel, setPlaybackLevel] = useState(0);
  const ttsPlayer = useTtsPlayer();

  const socketOptions = useMemo(() => {
    if (useMockSocket) {
      return {
        url: "ws://demo.local",
        WebSocketImpl: DemoWebSocket
      };
    }

    return {
      url: wsUrl as string
    };
  }, [useMockSocket, wsUrl]);

  const {
    status,
    startRecording,
    stopRecording,
    results,
    audioStream,
    isAudioPlaying
  } = useVoiceCommand({
    socketOptions
  });

  useEffect(() => {
    if (!audioStream) {
      setPlaybackLevel(0);
      return;
    }
    let isCancelled = false;
    const iterator = audioStream[Symbol.asyncIterator]();

    (async () => {
      try {
        await ttsPlayer.start();
        while (!isCancelled) {
          const { value, done } = await iterator.next();
          if (done || !value) {
            break;
          }
          const magnitude = await ttsPlayer.addChunk(value);
          if (typeof magnitude === "number") {
            setPlaybackLevel(magnitude);
          }
        }
        ttsPlayer.finish();
        await ttsPlayer.waitUntilIdle();
        if (!isCancelled) {
          setPlaybackLevel(0);
        }
      } catch (error) {
        console.warn("Unable to play TTS audio", error);
        ttsPlayer.finish(true);
      }
    })();

    return () => {
      isCancelled = true;
      iterator.return?.();
      ttsPlayer.reset();
      setPlaybackLevel(0);
    };
  }, [audioStream, ttsPlayer]);

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

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 520, margin: "0 auto" }}>
      <h1>useVoice React Demo</h1>
      <p>
        Mode: <strong>{useMockSocket ? "Mock socket" : "Cloudflare worker"}</strong>
      </p>
      <p>Stage: {status.stage}</p>
      <p>Live transcript: {status.realtimeText ?? "—"}</p>
      <p>Final transcript: {status.transcript ?? "—"}</p>
      <p>
        Response audio:{" "}
        {isAudioPlaying ? (
          <span style={{ color: "#2563eb" }}>streaming…</span>
        ) : (
          "—"
        )}
      </p>
      {isAudioPlaying && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              height: 8,
              background: "#dbeafe",
              borderRadius: 999,
              overflow: "hidden"
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, Math.round(playbackLevel * 120))}%`,
                background: "#2563eb",
                transition: "width 120ms linear"
              }}
            />
          </div>
        </div>
      )}
      <button onClick={handleToggle}>
        {status.stage === "recording" ? "Stop" : "Start Recording"}
      </button>
      {autoDemo && <p>Simulating...</p>}
      <section>
        <h2>Results</h2>
        <pre style={{ background: "#f5f5f5", padding: 12, borderRadius: 8 }}>
          {JSON.stringify(results, null, 2)}
        </pre>
      </section>
    </div>
  );
}
