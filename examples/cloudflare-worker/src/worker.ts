import { deepgram } from "@usevoice/deepgram";
import { cartesia } from "@usevoice/cartesia";
import { createVoiceDurableObject, MockAgentProcessor } from "@usevoice/server";

interface Env {
  VOICE_SESSION: DurableObjectNamespace;
  DEEPGRAM_API_KEY: string;
  CARTESIA_API_KEY: string;
  CARTESIA_VOICE_ID: string;
}

const VoiceSessionDO = createVoiceDurableObject<Env>({
  transcription: (env) => deepgram("nova-3", { apiKey: env.DEEPGRAM_API_KEY }),
  agent: (env) => new MockAgentProcessor(),
  speech: (env) => cartesia("sonic-3", { apiKey: env.CARTESIA_API_KEY }),
});

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/voice-command/ws") {
      const userId = url.searchParams.get("userId") ?? "demo-user";
      const id = env.VOICE_SESSION.newUniqueId();
      const stub = env.VOICE_SESSION.get(id);

      const headers = new Headers(request.headers);
      headers.set("X-Voice-User", JSON.stringify({ id: userId }));

      return stub.fetch(new Request(request, { headers }));
    }

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "useVoice worker running",
        }),
        { headers: { "content-type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};

export { VoiceSessionDO };
