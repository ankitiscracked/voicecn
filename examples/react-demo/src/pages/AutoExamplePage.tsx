import { VoiceDemo } from "../components/VoiceDemo";

export function AutoExamplePage() {
  return (
    <VoiceDemo
      title="Hands-free Auto Detection"
      description="Start the microphone once and your speech will be processed automatically when silence is detected."
      speechEndDetection={{ mode: "auto" }}
      highlight="Automatic speech end and start detection"
    />
  );
}
