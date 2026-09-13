import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { normalizePhone } from "../lib/phone.js";
import { requirePermission } from "../plugins/auth.js";

export const privacyRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/privacy/export",
    { preHandler: requirePermission("privacy:admin") },
    async (request, reply) => {
      const phone = (request.query as { phone?: string }).phone;
      if (!phone) return reply.status(400).send({ error: "phone required" });

      let phoneE164: string;
      try {
        phoneE164 = phone.startsWith("+") ? phone : normalizePhone(phone);
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "Invalid phone",
        });
      }

      const [broker, customer, prospect, developer, conversation, recipients, consent] =
        await Promise.all([
          prisma.broker.findUnique({ where: { phoneE164 } }),
          prisma.customer.findUnique({ where: { phoneE164 } }),
          prisma.prospect.findUnique({ where: { phoneE164 } }),
          prisma.developer.findUnique({ where: { phoneE164 } }),
          prisma.conversation.findUnique({
            where: { phoneE164 },
            include: { messages: { orderBy: { createdAt: "asc" } } },
          }),
          prisma.campaignRecipient.findMany({ where: { phoneE164 } }),
          prisma.consentEvent.findMany({
            where: { phoneE164 },
            orderBy: { createdAt: "asc" },
          }),
        ]);

      return {
        phoneE164,
        exportedAt: new Date().toISOString(),
        broker,
        customer,
        prospect,
        developer,
        conversation,
        campaignRecipients: recipients,
        consentEvents: consent,
      };
    },
  );

  app.post(
    "/privacy/delete",
    { preHandler: requirePermission("privacy:admin") },
    async (request, reply) => {
      const parsed = z.object({ phone: z.string().min(5) }).safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "phone required" });
      }

      let phoneE164: string;
      try {
        phoneE164 = parsed.data.phone.startsWith("+")
          ? parsed.data.phone
          : normalizePhone(parsed.data.phone);
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "Invalid phone",
        });
      }

      const conversation = await prisma.conversation.findUnique({
        where: { phoneE164 },
      });
      if (conversation) {
        await prisma.message.deleteMany({
          where: { conversationId: conversation.id },
        });
        await prisma.conversation.delete({ where: { id: conversation.id } });
      }

      await prisma.campaignRecipient.deleteMany({ where: { phoneE164 } });
      await prisma.consentEvent.deleteMany({ where: { phoneE164 } });

      // Anonymize contacts rather than hard-delete codes integrity
      await Promise.all([
        prisma.broker.updateMany({
          where: { phoneE164 },
          data: {
            name: "Deleted User",
            phone: "deleted",
            email: null,
            optInStatus: false,
          },
        }),
        prisma.customer.updateMany({
          where: { phoneE164 },
          data: {
            name: "Deleted User",
            phone: "deleted",
            email: null,
            optInStatus: false,
          },
        }),
        prisma.prospect.updateMany({
          where: { phoneE164 },
          data: {
            name: "Deleted User",
            phone: "deleted",
            optInStatus: false,
            conversationHistoryRef: null,
          },
        }),
        prisma.developer.updateMany({
          where: { phoneE164 },
          data: {
            name: "Deleted User",
            phone: "deleted",
            email: null,
            companyName: null,
            optInStatus: false,
          },
        }),
      ]);

      // Keep suppression tombstone so campaigns stay blocked
      await prisma.suppressionEntry.upsert({
        where: { phoneE164 },
        update: { source: "privacy_delete", optedOutDate: new Date() },
        create: {
          phoneE164,
          source: "privacy_delete",
          optedOutDate: new Date(),
        },
      });

      return { ok: true, phoneE164 };
    },
  );

  app.post(
    "/privacy/retention/run",
    { preHandler: requirePermission("privacy:admin") },
    async () => {
      const settings = await prisma.appSettings.findUnique({
        where: { id: "default" },
      });
      const days = settings?.conversationRetentionDays ?? 365;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const result = await prisma.message.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      return { deletedMessages: result.count, cutoff, days };
    },
  );
};
