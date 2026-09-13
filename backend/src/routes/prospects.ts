import type { FastifyPluginAsync } from "fastify";
import { LeadStage, PropertyCategory, ProspectIntent, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { nextCode } from "../lib/ids.js";
import { normalizePhone } from "../lib/phone.js";
import { cascadeOptIn, cascadeOptOut } from "../lib/suppression.js";
import { requirePermission } from "../plugins/auth.js";

const prospectBodySchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  budgetMin: z.coerce.number().optional().nullable(),
  budgetMax: z.coerce.number().optional().nullable(),
  preferredLocation: z.string().optional().nullable(),
  propertyTypeInterest: z.nativeEnum(PropertyCategory).optional().nullable(),
  intent: z.nativeEnum(ProspectIntent).optional().nullable(),
  leadSource: z.string().optional().nullable(),
  leadStage: z.nativeEnum(LeadStage).optional(),
  lastInteractionDate: z.string().datetime().optional().nullable(),
  assignedBrokerId: z.string().optional().nullable(),
  optInStatus: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  conversationHistoryRef: z.string().optional().nullable(),
});

function serializeProspect(prospect: {
  budgetMin: { toString(): string } | null;
  budgetMax: { toString(): string } | null;
  [key: string]: unknown;
}) {
  return {
    ...prospect,
    budgetMin: prospect.budgetMin?.toString() ?? null,
    budgetMax: prospect.budgetMax?.toString() ?? null,
  };
}

export const prospectRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/prospects",
    { preHandler: requirePermission("contacts:read") },
    async (request) => {
      const q = request.query as Record<string, string | undefined>;
      const where: Prisma.ProspectWhereInput = {};

      if (q.stage) where.leadStage = q.stage as LeadStage;
      if (q.intent) where.intent = q.intent as ProspectIntent;
      if (q.tag) where.tags = { has: q.tag };
      if (q.location) {
        where.preferredLocation = { contains: q.location, mode: "insensitive" };
      }
      if (q.phone) {
        try {
          where.phoneE164 = normalizePhone(q.phone);
        } catch {
          where.phone = { contains: q.phone };
        }
      }
      if (q.search) {
        where.OR = [
          { name: { contains: q.search, mode: "insensitive" } },
          { phone: { contains: q.search } },
          { phoneE164: { contains: q.search } },
          { prospectCode: { contains: q.search, mode: "insensitive" } },
        ];
      }

      const data = await prisma.prospect.findMany({
        where,
        include: {
          assignedBroker: { select: { id: true, name: true, phoneE164: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: Math.min(Number(q.limit ?? 100), 200),
      });
      return { data: data.map(serializeProspect) };
    },
  );

  app.get(
    "/prospects/:id",
    { preHandler: requirePermission("contacts:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const prospect = await prisma.prospect.findUnique({
        where: { id },
        include: { assignedBroker: true },
      });
      if (!prospect) return reply.status(404).send({ error: "Prospect not found" });
      return serializeProspect(prospect);
    },
  );

  app.post(
    "/prospects",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const parsed = prospectBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      let phoneE164: string;
      try {
        phoneE164 = normalizePhone(parsed.data.phone);
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "Invalid phone",
        });
      }

      const prospectCode = await nextCode("PRS", "prospect");
      const optInStatus = parsed.data.optInStatus ?? true;

      try {
        const prospect = await prisma.prospect.create({
          data: {
            prospectCode,
            name: parsed.data.name,
            phone: parsed.data.phone,
            phoneE164,
            budgetMin: parsed.data.budgetMin ?? null,
            budgetMax: parsed.data.budgetMax ?? null,
            preferredLocation: parsed.data.preferredLocation ?? null,
            propertyTypeInterest: parsed.data.propertyTypeInterest ?? null,
            intent: parsed.data.intent ?? null,
            leadSource: parsed.data.leadSource ?? null,
            leadStage: parsed.data.leadStage ?? LeadStage.NEW,
            lastInteractionDate: parsed.data.lastInteractionDate
              ? new Date(parsed.data.lastInteractionDate)
              : null,
            assignedBrokerId: parsed.data.assignedBrokerId ?? null,
            optInStatus,
            tags: parsed.data.tags ?? [],
            conversationHistoryRef: parsed.data.conversationHistoryRef ?? null,
          },
          include: {
            assignedBroker: { select: { id: true, name: true } },
          },
        });

        if (!optInStatus) {
          await cascadeOptOut(phoneE164, "prospect");
        }

        return reply.status(201).send(serializeProspect(prospect));
      } catch {
        return reply.status(409).send({ error: "Prospect phone already exists" });
      }
    },
  );

  app.patch(
    "/prospects/:id",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = prospectBodySchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      let phoneE164: string | undefined;
      if (parsed.data.phone) {
        try {
          phoneE164 = normalizePhone(parsed.data.phone);
        } catch (error) {
          return reply.status(400).send({
            error: error instanceof Error ? error.message : "Invalid phone",
          });
        }
      }

      try {
        const prospect = await prisma.prospect.update({
          where: { id },
          data: {
            name: parsed.data.name,
            phone: parsed.data.phone,
            phoneE164,
            budgetMin:
              parsed.data.budgetMin === undefined ? undefined : parsed.data.budgetMin,
            budgetMax:
              parsed.data.budgetMax === undefined ? undefined : parsed.data.budgetMax,
            preferredLocation:
              parsed.data.preferredLocation === undefined
                ? undefined
                : parsed.data.preferredLocation,
            propertyTypeInterest:
              parsed.data.propertyTypeInterest === undefined
                ? undefined
                : parsed.data.propertyTypeInterest,
            intent: parsed.data.intent === undefined ? undefined : parsed.data.intent,
            leadSource:
              parsed.data.leadSource === undefined ? undefined : parsed.data.leadSource,
            leadStage: parsed.data.leadStage,
            lastInteractionDate:
              parsed.data.lastInteractionDate === undefined
                ? undefined
                : parsed.data.lastInteractionDate
                  ? new Date(parsed.data.lastInteractionDate)
                  : null,
            assignedBrokerId:
              parsed.data.assignedBrokerId === undefined
                ? undefined
                : parsed.data.assignedBrokerId,
            optInStatus: parsed.data.optInStatus,
            tags: parsed.data.tags,
            conversationHistoryRef:
              parsed.data.conversationHistoryRef === undefined
                ? undefined
                : parsed.data.conversationHistoryRef,
          },
          include: {
            assignedBroker: { select: { id: true, name: true } },
          },
        });

        if (parsed.data.optInStatus === false) {
          await cascadeOptOut(prospect.phoneE164, "prospect");
        } else if (parsed.data.optInStatus === true) {
          await cascadeOptIn(prospect.phoneE164, "prospect");
        }

        return serializeProspect(prospect);
      } catch {
        return reply.status(404).send({ error: "Prospect not found" });
      }
    },
  );
};
