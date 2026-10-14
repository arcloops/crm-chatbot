import type { FastifyPluginAsync } from "fastify";
import { MessageDirection, MessageStatus, MessageType } from "@prisma/client";
import { z } from "zod";
import { getAgent } from "../agent/index.js";
import { prisma } from "../lib/db.js";
import { assertCanMessage } from "../lib/messaging.js";
import { requirePermission } from "../plugins/auth.js";
import { getWhatsAppProvider } from "../whatsapp/index.js";

export const inboxRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/inbox/conversations",
    { preHandler: requirePermission("inbox:read") },
    async (request) => {
      const q = request.query as {
        filter?: string;
      };
      const where =
        q.filter === "escalated"
          ? { escalatedAt: { not: null } }
          : q.filter === "takeover"
            ? { humanTakeover: true }
            : {};

      const data = await prisma.conversation.findMany({
        where: {
          ...where,
          // Hide staff Chat test sessions from Inbox
          NOT: { phoneE164: { startsWith: "staff:" } },
        },
        orderBy: [{ escalatedAt: "desc" }, { updatedAt: "desc" }],
        include: {
          prospect: {
            select: {
              id: true,
              name: true,
              prospectCode: true,
              leadStage: true,
              preferredLocation: true,
              budgetMax: true,
              intent: true,
              notes: true,
              viewingAt: true,
              viewingNote: true,
              assignedBroker: { select: { id: true, name: true } },
              viewingRequests: {
                orderBy: { createdAt: "desc" },
                take: 3,
                include: {
                  listing: {
                    select: { listingCode: true, title: true, location: true },
                  },
                },
              },
            },
          },
          assignedStaff: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
        },
        take: 100,
      });
      return { data };
    },
  );

  app.get(
    "/inbox/conversations/:id",
    { preHandler: requirePermission("inbox:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const conversation = await prisma.conversation.findUnique({
        where: { id },
        include: {
          prospect: {
            include: {
              assignedBroker: { select: { id: true, name: true, phoneE164: true } },
              viewingRequests: {
                orderBy: { createdAt: "desc" },
                take: 5,
                include: {
                  listing: {
                    select: { listingCode: true, title: true, location: true },
                  },
                },
              },
            },
          },
          assignedStaff: { select: { id: true, name: true } },
          messages: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!conversation) {
        return reply.status(404).send({ error: "Not found" });
      }
      const windowOpen = conversation.windowExpiresAt
        ? conversation.windowExpiresAt.getTime() > Date.now()
        : false;
      return { conversation, windowOpen };
    },
  );

  app.post(
    "/inbox/conversations/:id/reply",
    { preHandler: requirePermission("inbox:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = z.object({ body: z.string().optional() }).safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "body required" });
      }

      const conversation = await prisma.conversation.findUnique({
        where: { id },
      });
      if (!conversation) return reply.status(404).send({ error: "Not found" });

      let windowOpen = false;
      try {
        const gate = await assertCanMessage(conversation.phoneE164, {
          requireWindowForText: false,
        });
        windowOpen = gate.windowOpen;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Cannot send";
        const status = msg.includes("suppression") || msg.includes("opted out") ? 403 : 400;
        return reply.status(status).send({ error: msg });
      }

      const text = parsed.data.body?.trim() ?? "";
      if (windowOpen && !text) {
        return reply.status(400).send({ error: "body required" });
      }

      const provider = await getWhatsAppProvider();
      const sendTemplate = !windowOpen;
      let result;
      try {
        result = sendTemplate
          ? await provider.sendTemplate({
              to: conversation.phoneE164,
              templateName: "hello_world",
              language: "en_US",
            })
          : await provider.sendText({
              to: conversation.phoneE164,
              body: text,
            });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Send failed";
        return reply.status(503).send({ error: msg });
      }

      const message = await prisma.message.create({
        data: {
          conversationId: id,
          direction: MessageDirection.OUT,
          type: sendTemplate ? MessageType.TEMPLATE : MessageType.TEXT,
          body: sendTemplate ? "[template:hello_world]" : text,
          templateName: sendTemplate ? "hello_world" : null,
          bspMessageId: result.bspMessageId,
          status:
            result.status === "FAILED"
              ? MessageStatus.FAILED
              : result.status === "QUEUED"
                ? MessageStatus.QUEUED
                : MessageStatus.DELIVERED,
        },
      });

      await prisma.conversation.update({
        where: { id },
        data: {
          lastOutboundAt: new Date(),
          humanTakeover: true,
          botEnabled: false,
          assignedStaffId: request.authUser!.sub,
        },
      });

      return { message, sentAsTemplate: sendTemplate, windowOpen };
    },
  );

  app.post(
    "/inbox/conversations/:id/takeover",
    { preHandler: requirePermission("inbox:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const conversation = await prisma.conversation.update({
          where: { id },
          data: {
            humanTakeover: true,
            botEnabled: false,
            assignedStaffId: request.authUser!.sub,
          },
        });
        return conversation;
      } catch {
        return reply.status(404).send({ error: "Not found" });
      }
    },
  );

  app.post(
    "/inbox/conversations/:id/release",
    { preHandler: requirePermission("inbox:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const conversation = await prisma.conversation.update({
          where: { id },
          data: {
            humanTakeover: false,
            botEnabled: true,
            assignedStaffId: null,
          },
        });
        return conversation;
      } catch {
        return reply.status(404).send({ error: "Not found" });
      }
    },
  );

  app.post(
    "/inbox/conversations/:id/suggest",
    { preHandler: requirePermission("inbox:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const conversation = await prisma.conversation.findUnique({
        where: { id },
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      });
      if (!conversation) return reply.status(404).send({ error: "Not found" });

      const lastInbound = conversation.messages.find(
        (m) => m.direction === MessageDirection.IN,
      );
      const history = conversation.messages
        .slice()
        .reverse()
        .filter((m) => m.body)
        .map((m) => ({
          role:
            m.direction === MessageDirection.IN
              ? ("user" as const)
              : ("assistant" as const),
          content: m.body!,
        }))
        .filter((m) => m.content !== (lastInbound?.body ?? ""));

      const agent = getAgent();
      const suggestion = await agent.reply({
        phoneE164: conversation.phoneE164,
        userText: lastInbound?.body ?? "Help with property search",
        history,
        channel: "whatsapp",
        conversationId: conversation.id,
        prospectId: conversation.prospectId ?? undefined,
      });
      return { suggestion: suggestion.text, agent: agent.name, toolCalls: suggestion.toolCalls };
    },
  );
};
