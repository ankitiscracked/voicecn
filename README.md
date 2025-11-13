# useVoice

This workspace hosts the useVoice multi-runtime voice AI SDK. It is organized as a Bun workspace so packages can share tooling and be versioned together.

## Packages

| Package             | Description                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `@usevoice/core`     | Framework-agnostic socket client, recorder, controller, and state store.                                             |
| `@usevoice/react`    | `useVoiceCommand` hook that binds React apps to the core controller.                                                 |
| `@usevoice/vue`      | Vue composable equivalent to the React hook.                                                                         |
| `@usevoice/server`   | Runtime-agnostic voice session manager, adapters, and STT/TTS/agent provider scaffolding.                            |
| `@usevoice/deepgram` | Deepgram transcription provider that implements the `TranscriptionProvider` interface via a supplied `createClient`. |
| `@usevoice/cartesia` | Cartesia TTS streamer that implements the `TtsStreamer` interface with a supplied Cartesia client.                   |

Examples live under `examples/*` so we can test React and Vue integrations against the same API surface.

### Provider Packages

`@usevoice/deepgram` and `@usevoice/cartesia` are thin helpers that turn vendor SDK clients into the interfaces expected by `@usevoice/server`. They intentionally do **not** bundle the vendor SDKs. Install the upstream SDK in your app (e.g. `@deepgram/sdk`, `@cartesia/cartesia-js`) and supply a `clientFactory` when constructing the provider:

```ts
import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { DeepgramTranscriptionProvider } from "@usevoice/deepgram";

const deepgramProvider = new DeepgramTranscriptionProvider({
  apiKey: process.env.DEEPGRAM_API_KEY!,
  clientFactory: createDeepgramClient,
});
```

Use the resulting provider instance when wiring `VoiceSessionManager` or the provided adapters.

### Example Apps

- React: `bun --filter @usevoice/example-react run dev`
- Vue: `bun --filter @usevoice/example-vue run dev`
- Cloudflare Worker (backend): `cd examples/cloudflare-worker && bun install && bun run dev`

Both demos use the mock WebSocket implementation bundled with each example so you can exercise the `useVoiceCommand` hooks without a backend yet.

To test end-to-end with the Cloudflare worker:

1. Install dependencies and configure the required secrets inside `examples/cloudflare-worker` (`DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`).
2. Run `bun run dev` inside that folder to start the worker locally (defaults to `http://127.0.0.1:8787`).
3. Copy the websocket URL (`ws://127.0.0.1:8787/voice-command/ws?userId=demo`) into `examples/react-demo/.env` as `VITE_USEVOICE_WS_URL`.
4. Start the React demo (`bun --filter @usevoice/example-react run dev`) and verify the status/progress updates round-trip through the worker.

Set `VITE_USEVOICE_USE_MOCK=1` if you want to fall back to the built-in fake socket without running the worker.

## Scripts

- `bun run build` – runs each package build.
- `bun run dev` – runs package-level dev/watch scripts (when defined).
- `bun run test` – executes unit tests in every workspace.
- `bun run lint` – placeholder for linters.

## Next Steps

1. Replace the mock providers with production integrations by instantiating `@usevoice/deepgram` / `@usevoice/cartesia` (or custom providers) inside your backend.
2. Flesh out deployment-specific glue (Cloudflare Durable Objects, Node WebSocket servers) using the adapters included under `packages/server/src/adapters`.
3. Iterate on the sample apps in `examples/react-demo` and `examples/vue-demo` with real backend connectivity.
