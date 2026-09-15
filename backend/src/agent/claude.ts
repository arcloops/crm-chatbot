import { env } from "../lib/env.js";
import { getLogger } from "../lib/logger.js";
import { MockAgent } from "./mock.js";
import {
  AGENT_TOOLS,
  DASHBOARD_SYSTEM_PROMPT,
  WHATSAPP_SYSTEM_PROMPT,
} from "./toolDefinitions.js";
import {
  executeTool,
  mergeSideEffects,
  type ToolSideEffects,
} from "./toolExecutors.js";
import { normalizeProspectIntent } from "./tools.js";
import type { AgentMessage, AgentProvider, AgentReply, AgentReplyInput } from "./types.js";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

const MAX_TOOL_ROUNDS = 5;

export class ClaudeAgent implements AgentProvider {
  readonly name = "claude";

  async reply(input: AgentReplyInput): Promise<AgentReply> {
    const apiKey = env().ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new MockAgent().reply(input);
    }

    try {
      const isDashboard = input.channel === "dashboard";
      const system = isDashboard ? DASHBOARD_SYSTEM_PROMPT : WHATSAPP_SYSTEM_PROMPT;

      const prior = (input.history ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const userPrefix = isDashboard
        ? `Staff user (${input.staffName?.trim() || "staff"}) asks`
        : "Prospect message";

      const messages: AnthropicMessage[] = [
        ...prior,
        {
          role: "user",
          content: `${userPrefix}: ${input.userText}\n\nProspect phone: ${input.phoneE164}${
            input.profileName ? `\nProfile name: ${input.profileName}` : ""
          }`,
        },
      ];

      let sideEffects: ToolSideEffects = {};
      const toolCalls: AgentReply["toolCalls"] = [];
      let finalText = "";

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 1024,
            system,
            tools: AGENT_TOOLS,
            messages,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          getLogger({ route: "agent/claude" }).warn(
            { status: res.status, body: errBody.slice(0, 500) },
            "Anthropic request failed; falling back to mock",
          );
          return new MockAgent().reply(input);
        }

        const data = (await res.json()) as {
          stop_reason?: string;
          content?: AnthropicContentBlock[];
        };

        const blocks = data.content ?? [];
        const toolUses = blocks.filter(
          (b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
            b.type === "tool_use",
        );
        const textParts = blocks
          .filter((b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text")
          .map((b) => b.text)
          .filter(Boolean);

        if (textParts.length) {
          finalText = textParts.join("\n").trim();
        }

        if (!toolUses.length || data.stop_reason === "end_turn") {
          break;
        }

        messages.push({ role: "assistant", content: blocks });

        const toolResults: Array<{
          type: "tool_result";
          tool_use_id: string;
          content: string;
        }> = [];

        for (const tool of toolUses) {
          const inputArgs =
            tool.input && typeof tool.input === "object"
              ? (tool.input as Record<string, unknown>)
              : {};
          toolCalls.push({ name: tool.name, input: inputArgs });
          const { content, sideEffects: next } = await executeTool(tool.name, inputArgs, {
            phoneE164: input.phoneE164,
            conversationId: input.conversationId,
            prospectId: input.prospectId,
            profileName: input.profileName,
            channel: input.channel,
          });
          sideEffects = mergeSideEffects(sideEffects, next);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tool.id,
            content: JSON.stringify(content),
          });
        }

        messages.push({ role: "user", content: toolResults as unknown as AnthropicContentBlock[] });
      }

      if (!finalText) {
        finalText = sideEffects.listings?.length
          ? `I found ${sideEffects.listings.length} matching listing(s). Ask me for details on a listing code.`
          : "How can I help with your property search?";
      }

      return {
        text: finalText,
        escalate: sideEffects.escalate,
        escalationSummary: sideEffects.escalationSummary,
        bookViewing: sideEffects.bookViewing,
        viewingNote: sideEffects.viewingNote,
        extracted: sideEffects.extracted
          ? {
              budgetMax: sideEffects.extracted.budgetMax,
              budgetMin: sideEffects.extracted.budgetMin,
              preferredLocation: sideEffects.extracted.preferredLocation,
              intent: normalizeProspectIntent(sideEffects.extracted.intent),
              bedrooms: sideEffects.extracted.bedrooms,
            }
          : undefined,
        listings: sideEffects.listings,
        toolCalls,
      };
    } catch (err) {
      getLogger({ route: "agent/claude" }).error({ err }, "Claude agent failed");
      return new MockAgent().reply(input);
    }
  }
}

// Keep type import used for history filtering clarity
void (null as unknown as AgentMessage);
