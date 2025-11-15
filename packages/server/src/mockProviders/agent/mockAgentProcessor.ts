import type { AgentProcessor } from "../../types";

export interface MockAgentProcessorOptions {
  responsePrefix?: string;
}

export class MockAgentProcessor implements AgentProcessor {
  constructor(private options: MockAgentProcessorOptions = {}) {}

  async process({
    transcript,
    send
  }: Parameters<AgentProcessor["process"]>[0]) {
    const prefix = this.options.responsePrefix ?? "Agent response:";
    await send({
      type: "complete",
      data: {
        intent: "fetch",
        transcript,
        graphPaths: [],
        fallbackResults: [],
        formattedContent: {
          format: "paragraph",
          content: `${prefix} ${transcript}`
        },
        timestamp: Date.now()
      }
    });
  }
}
