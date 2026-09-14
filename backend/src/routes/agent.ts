import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getAgent } from "../agent/index.js";
import { env } from "../lib/env.js";
import { requirePermission } from "../plugins/auth.js";

const historyItem = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const chatSchema = z.object({
  message: z.string().min(1).max(4000),
  phoneE164: z.string().min(5).max(20).optional(),
  history: z.array(historyItem).max(40).optional(),
});

export const agentRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/agent/status",
    { preHandler: requirePermission("inbox:read") },
    async () => {
      const agent = getAgent();
      return {
        agent: agent.name,
        anthropicConfigured: Boolean(env().ANTHROPIC_API_KEY),
      };
    },
  );

  app.post(
    "/agent/chat",
    { preHandler: requirePermission("inbox:read") },
    async (request, reply) => {
      const parsed = chatSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const phoneE164 = parsed.data.phoneE164 ?? "+8801999000001";
      const agent = getAgent();
      const result = await agent.reply({
        phoneE164,
        userText: parsed.data.message,
        history: parsed.data.history,
      });

      return {
        agent: agent.name,
        anthropicConfigured: Boolean(env().ANTHROPIC_API_KEY),
        reply: result.text,
        escalate: Boolean(result.escalate),
        bookViewing: Boolean(result.bookViewing),
        extracted: result.extracted ?? null,
        listings: result.listings ?? [],
      };
    },
  );
};
