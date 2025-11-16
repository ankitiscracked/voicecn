# usevoiceai

### The Typescript toolkit for ambitious voice AI apps

Build end-to-end voice AI apps in a few lines of code. Speech-To-Text -> Your agent processing code -> Text-To-Speech like it's no big deal. Speaking to your computer is not going to be a pain anymore.

Voice models have gotten really good lately but the infra to stitch everything together is lacking. Model providers have their SDKs but every provider have different interfaces. We have frameworks like Pipecat which are great but I needed something like AI SDK to get from idea to prod as soon as it is possible. In fact, the API is hugely inspired by AI SDK. So `usevoiceai` is an attempt to build something sophisticated with the same API simplicity and engineer ergonomics.

## Tutorial

Enough talk! Let's jump right into it.

The SDK has two main parts for the minimum setup required to get up and running.

### Client quickstart

Add `useVoice` and `useAudio` hooks to your react component like this. Call `startRecording` to start streaming your voice. As you speak, partial transcripts will be reflected in the `transcript` variable. It's reactive so you can use it to show incremental transcripts.

Once you call `stopRecording`, `status` will move into the `processing ` stage. After the server is done processing, status moves to the `complete` stage and `audioStream` becomes available. You can pass it to the `useAudio` hook to automatically start playing the response audio or use it however you want. It's just an async iterable containing raw audio PCM chunks.

```jsx
import { useAudio, useVoice } from "@usevoiceai/react";

export function App() {
  const { startRecording, stopRecording, transcript, audioStream } = useVoice();
  const { stop } = useAudio(audioStream);
}
```

### Server quickstart

Here we are using the Cloudflare's [Durable Object](https://developers.cloudflare.com/durable-objects/) [websockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) adapter. Support for more transport is coming soon.

Implment the `AgentProcessor` interface. You are given the transcript from the STT provider and a `send` callback to forward your response text to the TTS provider.

Use the Durable Objects factory function `createVoiceDurableObject` to forward the web request to it. It automatically upgrades the request to websocket internally. Now the subsequent requests will directly go to that socket connection for the whole client session.

```ts
import { cartesia } from "@usevoiceai/cartesia";
import { deepgram } from "@usevoiceai/deepgram";
import { AgentProcessor, createVoiceDurableObject } from "@usevoiceai/server";

class MockAgentProcessor implements AgentProcessor {
  constructor(private env: Env) {}
  async process({
    transcript,
    send,
  }: Parameters<AgentProcessor["process"]>[0]) {
    // do something with the transcript and return response
    await send({
      type: "complete",
      data: {
        responseText: response,
      },
    });
  }
}

const VoiceSessionDO = createVoiceDurableObject<Env>({
  transcription: (env) => deepgram("nova-3", { apiKey: env.DEEPGRAM_API_KEY }),
  agent: (env) => new MockAgentProcessor(env),
  speech: (env) => cartesia("sonic-3", { apiKey: env.CARTESIA_API_KEY }),
});

export default {
  async fetch(request: Request, env: Env) {
      const stub = env.VOICE_SESSION.get(id);
      return stub.fetch(new Request(request, { headers }));
    }
    return new Response("Not found", { status: 404 });
  },
};

export { VoiceSessionDO };
```

That's it really. I'm not kidding. You can now speak to your computer and get spoken back. :)

See Examples section to see how to run this code.

## Packages

| Package                 | Description                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@usevoiceai/core`      | Framework-agnostic websocket client, voice recorder, controller that wires everything up, and state store.                                                                         |
| `@usevoiceai/react`     | `useVoice` and `useAudio` hooks which are the main interfaces for capturing speech and playing the response speech on web clients.                                                 |
| `@usevoiceai/server`    | Runtime-agnostic voice session, session adapters for transports such a Durable Objects websockets, Node websockets, etc., and STT/TTS/agent provider scaffolding.                  |
| `@usevoiceai/providers` | Voice service providers such as transcription, speech generation, etc. Deepgram for transcription and Cartesia for speech generation is implemented out of box. More to come soon. |

Examples live under `examples/*` so we can test React and Vue integrations against the same API surface.

### Example Apps

This workspace uses [Bun](https://bun.com/docs/installation) and it's workspaces feature for development.

- React: `cd examples/react && bun install && bun run dev`
- Cloudflare Worker (backend): `cd examples/cloudflare-worker && bun install && bun run dev`

To test an end-to-end voice session with a React app and a Cloudflare worker:

1. Install dependencies and configure the required secrets inside `examples/cloudflare-worker`

- `DEEPGRAM_API_KEY` - [find here](https://developers.deepgram.com/docs/create-additional-api-keys)
- `CARTESIA_API_KEY` - [find here](https://play.cartesia.ai/keys)
- `GOOGLE_GENERATIVE_AI_API_KEY`(optional) - find here or replace the code with your own `AgentProcessor` implementation and return any response text you want.

All these services provide generous free credits and getting API keys is super simple.

2. Run `bun run dev` inside that folder to start the worker locally (defaults to `http://127.0.0.1:8787`).
3. Copy the websocket URL (`ws://127.0.0.1:8787/voice-command/ws?userId=demo`) into `examples/react-demo/.env` as `VITE_USEVOICEAI_WS_URL`.
4. Start the React demo (`bun --filter @usevoiceai/example-react run dev`).
5. Profit!

## Scripts

- `bun run build` – runs each package build.
- `bun run dev` – runs package-level dev/watch scripts.
- `bun run test` – executes unit tests in every workspace.
- `bun run lint` – placeholder for linters.

### Quick roadmap

- Add support for local models
- Add support for more transports
- Add support for more voice service providers
- Last but not the least, conventional commits ;D

## Next Steps

Docs website and more guides coming soon.
