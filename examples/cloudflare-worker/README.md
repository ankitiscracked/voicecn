# usevoiceai Cloudflare Worker Example

This worker shows how to wire the shared useVoice `VoiceSessionManager` into the Cloudflare Durable Object adapter while using the provider packages:

- `@usevoiceai/deepgram` for speech-to-text (requires `@deepgram/sdk`)
- `@usevoiceai/cartesia` for text-to-speech streaming (requires `@cartesia/cartesia-js`)

## Prerequisites

1. Install dependencies inside this folder:
   ```bash
   cd usevoice/examples/cloudflare-worker
   bun install
   ```
2. Provide the required secrets:
   ```bash
   wrangler secret put DEEPGRAM_API_KEY
   wrangler secret put CARTESIA_API_KEY
   wrangler secret put CARTESIA_VOICE_ID
   ```

## Development

```bash
bun run dev
```

The dev server exposes `http://127.0.0.1:8787/voice-command/ws`. Pass a `userId` query param (e.g. `?userId=demo`). Point the React example at this websocket URL to test end-to-end.

## Deployment

```bash
bun run deploy
```
