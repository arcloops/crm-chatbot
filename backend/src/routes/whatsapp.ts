import type { FastifyPluginAsync } from "fastify";
import {
  CampaignRecipientStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  WhatsAppMode,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { assertCanMessage } from "../lib/messaging.js";
import { requirePermission } from "../plugins/auth.js";
import { getWhatsAppProvider } from "../whatsapp/index.js";
import { handleInboundMessage } from "../whatsapp/inbound.js";

async function upsertConversation(phoneE164: string) {
  const prospect = await prisma.prospect.findUnique({ where: { phoneE164 } });
  return prisma.conversation.upsert({
    where: { phoneE164 },
    update: { prospectId: prospect?.id ?? undefined },
    create: {
      phoneE164,
      prospectId: prospect?.id ?? null,
    },
  });
}

const sendSchema = z.object({
  to: z.string().min(5),
  type: z.enum(["TEXT", "TEMPLATE", "MEDIA"]).default("TEXT"),
  body: z.string().optional(),
  templateName: z.string().optional(),
  mediaUrl: z.string().url().optional(),
});

export const whatsappRoutes: FastifyPluginAsync = async (app) => {
  app.get("/webhooks/whatsapp", async (request, reply) => {
    const provider = await getWhatsAppProvider();
    const query = request.query as Record<string, string | undefined>;
    const result = provider.verifyWebhook(query);
    if (!result.ok) return reply.status(403).send("Forbidden");
    return reply.status(200).send(result.challenge ?? "ok");
  });

  app.post("/webhooks/whatsapp", async (request, _reply) => {
    const provider = await getWhatsAppProvider();
    const events = provider.parseWebhook(
      request.body,
      request.headers as Record<string, string | string[] | undefined>,
    );

    for (const event of events) {
      if (event.kind === "status" && event.bspMessageId) {
        await prisma.message.updateMany({
          where: { bspMessageId: event.bspMessageId },
          data: {
            status: (event.status as MessageStatus) ?? MessageStatus.DELIVERED,
            errorCode: event.errorCode ?? null,
          },
        });

        const recipients = await prisma.campaignRecipient.findMany({
          where: { bspMessageId: event.bspMessageId },
          select: { id: true, campaignId: true, status: true },
        });

        for (const recipient of recipients) {
          if (event.status === "FAILED") {
            await prisma.campaignRecipient.update({
              where: { id: recipient.id },
              data: { status: CampaignRecipientStatus.FAILED },
            });
          } else if (event.status === "DELIVERED" || event.status === "READ") {
            if (recipient.status !== CampaignRecipientStatus.REPLIED) {
              await prisma.campaignRecipient.update({
                where: { id: recipient.id },
                data: { status: CampaignRecipientStatus.DELIVERED },
              });
            }
            if (event.status === "READ") {
              await prisma.campaign.update({
                where: { id: recipient.campaignId },
                data: { readCount: { increment: 1 } },
              });
            }
          } else if (event.status === "SENT") {
            if (
              recipient.status === CampaignRecipientStatus.QUEUED ||
              recipient.status === CampaignRecipientStatus.PENDING
            ) {
              await prisma.campaignRecipient.update({
                where: { id: recipient.id },
                data: { status: CampaignRecipientStatus.SENT },
              });
            }
          }
        }
        continue;
      }

      if (event.kind === "message" && event.from && event.body) {
        await handleInboundMessage({
          from: event.from,
          body: event.body,
          bspMessageId: event.bspMessageId,
          mediaUrl: event.mediaUrl,
        });
      }
    }

    return { ok: true, processed: events.length };
  });

  app.get(
    "/whatsapp/templates",
    { preHandler: requirePermission("contacts:read") },
    async () => {
      const data = await prisma.whatsAppTemplate.findMany({
        orderBy: { name: "asc" },
      });
      return { data };
    },
  );

  app.get(
    "/whatsapp/conversations",
    { preHandler: requirePermission("contacts:read") },
    async () => {
      const data = await prisma.conversation.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          prospect: { select: { id: true, name: true, prospectCode: true } },
          _count: { select: { messages: true } },
        },
        take: 50,
      });
      return { data };
    },
  );

  app.get(
    "/whatsapp/conversations/:id/messages",
    { preHandler: requirePermission("contacts:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const conversation = await prisma.conversation.findUnique({
        where: { id },
      });
      if (!conversation) {
        return reply.status(404).send({ error: "Conversation not found" });
      }
      const messages = await prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "asc" },
      });
      const windowOpen = conversation.windowExpiresAt
        ? conversation.windowExpiresAt.getTime() > Date.now()
        : false;
      return { conversation, messages, windowOpen };
    },
  );

  app.post(
    "/whatsapp/send",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const parsed = sendSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        const gate = await assertCanMessage(parsed.data.to, {
          requireWindowForText: parsed.data.type === "TEXT",
        });

        const conversation = await upsertConversation(gate.phoneE164);
        const provider = await getWhatsAppProvider();
        let result;
        let type: MessageType = MessageType.TEXT;
        let body = parsed.data.body ?? null;
        let templateName: string | null = null;
        let mediaUrl: string | null = null;

        if (parsed.data.type === "TEMPLATE") {
          if (!parsed.data.templateName) {
            return reply.status(400).send({ error: "templateName required" });
          }
          type = MessageType.TEMPLATE;
          templateName = parsed.data.templateName;
          result = await provider.sendTemplate({
            to: gate.phoneE164,
            templateName: parsed.data.templateName,
          });
          body = body ?? `[template:${parsed.data.templateName}]`;
        } else if (parsed.data.type === "MEDIA") {
          if (!parsed.data.mediaUrl) {
            return reply.status(400).send({ error: "mediaUrl required" });
          }
          type = MessageType.MEDIA;
          mediaUrl = parsed.data.mediaUrl;
          result = await provider.sendMedia({
            to: gate.phoneE164,
            mediaUrl: parsed.data.mediaUrl,
            caption: parsed.data.body,
          });
        } else {
          if (!parsed.data.body) {
            return reply.status(400).send({ error: "body required" });
          }
          result = await provider.sendText({
            to: gate.phoneE164,
            body: parsed.data.body,
          });
        }

        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: MessageDirection.OUT,
            type,
            body,
            templateName,
            mediaUrl,
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
          where: { id: conversation.id },
          data: { lastOutboundAt: new Date() },
        });

        return { message, provider: provider.name, windowOpen: gate.windowOpen };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Send failed";
        const status =
          msg.includes("suppression") || msg.includes("opted out")
            ? 403
            : msg.includes("window")
              ? 400
              : 503;
        return reply.status(status).send({ error: msg });
      }
    },
  );

  app.post(
    "/whatsapp/mock/inbound",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const settings = await prisma.appSettings.findUnique({
        where: { id: "default" },
      });
      if (settings && settings.whatsappMode !== WhatsAppMode.MOCK) {
        return reply
          .status(400)
          .send({ error: "Mock inbound only available in MOCK mode" });
      }

      const parsed = z
        .object({
          from: z.string().min(5),
          body: z.string().min(1),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "from and body required" });
      }

      const result = await handleInboundMessage({
        from: parsed.data.from,
        body: parsed.data.body,
      });

      const conversation = await prisma.conversation.findUnique({
        where: { id: result.conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      return { ok: true, action: result.action, conversation };
    },
  );
};
