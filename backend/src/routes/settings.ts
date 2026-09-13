import type { FastifyPluginAsync } from "fastify";
import { WhatsAppMode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { authenticate, requirePermission } from "../plugins/auth.js";

async function getOrCreateSettings() {
  return prisma.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      defaultCurrency: "BDT",
      coldLeadDays: 30,
      whatsappMode: WhatsAppMode.MOCK,
    },
  });
}

const settingsPatchSchema = z.object({
  defaultCurrency: z.string().min(1).optional(),
  coldLeadDays: z.coerce.number().int().positive().max(365).optional(),
  whatsappMode: z.nativeEnum(WhatsAppMode).optional(),
  bspDisplayName: z.string().optional().nullable(),
  conversationRetentionDays: z.coerce.number().int().positive().max(3650).optional(),
  integrationWebhookUrl: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().url().nullable().optional(),
  ),
});

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/settings", { preHandler: authenticate }, async () => {
    return getOrCreateSettings();
  });

  app.patch(
    "/settings",
    { preHandler: requirePermission("staff:write") },
    async (request, reply) => {
      // Admin-only via staff:write (only ADMIN has it)
      const parsed = settingsPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      await getOrCreateSettings();
      return prisma.appSettings.update({
        where: { id: "default" },
        data: {
          defaultCurrency: parsed.data.defaultCurrency,
          coldLeadDays: parsed.data.coldLeadDays,
          whatsappMode: parsed.data.whatsappMode,
          bspDisplayName:
            parsed.data.bspDisplayName === undefined
              ? undefined
              : parsed.data.bspDisplayName,
          conversationRetentionDays: parsed.data.conversationRetentionDays,
          integrationWebhookUrl:
            parsed.data.integrationWebhookUrl === undefined
              ? undefined
              : parsed.data.integrationWebhookUrl || null,
        },
      });
    },
  );
};

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get("/search", { preHandler: authenticate }, async (request, reply) => {
    const q = (request.query as { q?: string }).q?.trim();
    if (!q || q.length < 2) {
      return reply.status(400).send({ error: "q must be at least 2 characters" });
    }

    const [listings, brokers, customers, prospects] = await Promise.all([
      prisma.listing.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { listingCode: { contains: q, mode: "insensitive" } },
            { location: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          listingCode: true,
          title: true,
          location: true,
          availabilityStatus: true,
        },
        take: 10,
      }),
      prisma.broker.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { phoneE164: { contains: q } },
            { brokerCode: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, brokerCode: true, name: true, phoneE164: true },
        take: 10,
      }),
      prisma.customer.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { phoneE164: { contains: q } },
            { customerCode: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, customerCode: true, name: true, phoneE164: true },
        take: 10,
      }),
      prisma.prospect.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { phoneE164: { contains: q } },
            { prospectCode: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          prospectCode: true,
          name: true,
          phoneE164: true,
          leadStage: true,
        },
        take: 10,
      }),
    ]);

    return { q, listings, brokers, customers, prospects };
  });
};
