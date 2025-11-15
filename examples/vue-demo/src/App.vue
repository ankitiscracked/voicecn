<template>
  <main class="app">
    <h1>useVoice Vue Demo</h1>
    <p>Stage: {{ command.status.stage }}</p>
    <p>Live transcript: {{ command.status.realtimeText ?? "—" }}</p>
    <p>Final transcript: {{ command.status.transcript ?? "—" }}</p>
    <button @click="toggle">
      {{ command.status.stage === "recording" ? "Stop" : "Start Demo Recording" }}
    </button>
    <section>
      <h2>Results</h2>
      <pre>{{ command.results }}</pre>
    </section>
  </main>
</template>

<script setup lang="ts">
import { useVoiceCommand } from "@usevoiceai/vue";
import { DemoWebSocket } from "./mockServerSocket";

const command = useVoiceCommand({
  socketOptions: {
    url: "wss://demo.local",
    WebSocketImpl: DemoWebSocket
  }
});

const toggle = async () => {
  if (command.status.value.stage === "recording") {
    command.stopRecording();
    return;
  }
  await command.startRecording();
  setTimeout(() => {
    command.stopRecording();
  }, 1000);
};
</script>

<style scoped>
.app {
  font-family: system-ui, sans-serif;
  max-width: 520px;
  margin: 0 auto;
  padding: 24px;
}
button {
  margin-bottom: 16px;
}
pre {
  background: #f5f5f5;
  padding: 12px;
  max-height: 200px;
  overflow: auto;
}
</style>
