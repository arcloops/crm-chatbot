import { env } from "../lib/env.js";
import { ClaudeAgent } from "./claude.js";
import { MockAgent } from "./mock.js";
import type { AgentProvider } from "./types.js";

export function getAgent(): AgentProvider {
  if (env().ANTHROPIC_API_KEY) {
    return new ClaudeAgent();
  }
  return new MockAgent();
}

export type { AgentProvider, AgentReply } from "./types.js";
