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

      const staff = request.authUser!;
      const agent = getAgent();
      const result = await agent.reply({
        // Internal session key only — dashboard chat is staff↔Anthropic, not WhatsApp.
        phoneE164: `staff:${staff.sub}`,
        userText: parsed.data.message,
        history: parsed.data.history,
        channel: "dashboard",
        staffName: staff.name || staff.email,
      });

      return {
        agent: agent.name,
        anthropicConfigured: Boolean(env().ANTHROPIC_API_KEY),
        reply: result.text,
        escalate: Boolean(result.escalate),
        bookViewing: Boolean(result.bookViewing),
        extracted: result.extracted ?? null,
        listings: result.listings ?? [],
        staff: { id: staff.sub, name: staff.name, email: staff.email },
      };
    },
  );
};
