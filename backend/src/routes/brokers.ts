import type { FastifyPluginAsync } from "fastify";
import { ActiveStatus, BrokerSpecialization, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { nextCode } from "../lib/ids.js";
import { normalizePhone } from "../lib/phone.js";
import { cascadeOptIn, cascadeOptOut } from "../lib/suppression.js";
import { requirePermission } from "../plugins/auth.js";

const brokerBodySchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  email: z.string().email().optional().nullable(),
  regionArea: z.string().optional().nullable(),
  specialization: z.nativeEnum(BrokerSpecialization).optional().nullable(),
  activeStatus: z.nativeEnum(ActiveStatus).optional(),
  joinDate: z.string().datetime().optional().nullable(),
  optInStatus: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  listingIds: z.array(z.string()).optional(),
});

export const brokerRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/brokers",
    { preHandler: requirePermission("contacts:read") },
    async (request) => {
      const q = request.query as Record<string, string | undefined>;
      const where: Prisma.BrokerWhereInput = {};

      if (q.name) where.name = { contains: q.name, mode: "insensitive" };
      if (q.region) where.regionArea = { contains: q.region, mode: "insensitive" };
      if (q.status) where.activeStatus = q.status as ActiveStatus;
      if (q.phone) {
        try {
          where.phoneE164 = normalizePhone(q.phone);
        } catch {
          where.phone = { contains: q.phone };
        }
      }
      if (q.tag) where.tags = { has: q.tag };
      if (q.search) {
        where.OR = [
          { name: { contains: q.search, mode: "insensitive" } },
          { phone: { contains: q.search } },
          { phoneE164: { contains: q.search } },
          { brokerCode: { contains: q.search, mode: "insensitive" } },
        ];
      }

      const data = await prisma.broker.findMany({
        where,
        include: {
          listingsAssigned: { select: { id: true, listingCode: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(Number(q.limit ?? 100), 200),
      });
      return { data };
    },
  );

  app.get(
    "/brokers/:id",
    { preHandler: requirePermission("contacts:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const broker = await prisma.broker.findUnique({
        where: { id },
        include: {
          listingsAssigned: true,
          ownedListings: true,
          customers: { select: { id: true, name: true, phoneE164: true } },
          prospects: {
            select: { id: true, name: true, phoneE164: true, leadStage: true },
          },
        },
      });
      if (!broker) return reply.status(404).send({ error: "Broker not found" });
      return broker;
    },
  );

  app.post(
    "/brokers",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const parsed = brokerBodySchema.safeParse(request.body);
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

      const brokerCode = await nextCode("BRK", "broker");
      const optInStatus = parsed.data.optInStatus ?? true;

      try {
        const broker = await prisma.broker.create({
          data: {
            brokerCode,
            name: parsed.data.name,
            phone: parsed.data.phone,
            phoneE164,
            email: parsed.data.email ?? null,
            regionArea: parsed.data.regionArea ?? null,
            specialization: parsed.data.specialization ?? null,
            activeStatus: parsed.data.activeStatus ?? ActiveStatus.ACTIVE,
            joinDate: parsed.data.joinDate ? new Date(parsed.data.joinDate) : null,
            optInStatus,
            tags: parsed.data.tags ?? [],
            listingsAssigned: parsed.data.listingIds
              ? { connect: parsed.data.listingIds.map((id) => ({ id })) }
              : undefined,
          },
          include: {
            listingsAssigned: { select: { id: true, listingCode: true, title: true } },
          },
        });

        if (!optInStatus) {
          await cascadeOptOut(phoneE164, "broker");
        }

        return reply.status(201).send(broker);
      } catch {
        return reply.status(409).send({ error: "Broker phone already exists" });
      }
    },
  );

  app.patch(
    "/brokers/:id",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = brokerBodySchema.partial().safeParse(request.body);
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
        const broker = await prisma.broker.update({
          where: { id },
          data: {
            name: parsed.data.name,
            phone: parsed.data.phone,
            phoneE164,
            email: parsed.data.email === undefined ? undefined : parsed.data.email,
            regionArea:
              parsed.data.regionArea === undefined ? undefined : parsed.data.regionArea,
            specialization:
              parsed.data.specialization === undefined
                ? undefined
                : parsed.data.specialization,
            activeStatus: parsed.data.activeStatus,
            joinDate:
              parsed.data.joinDate === undefined
                ? undefined
                : parsed.data.joinDate
                  ? new Date(parsed.data.joinDate)
                  : null,
            optInStatus: parsed.data.optInStatus,
            tags: parsed.data.tags,
            listingsAssigned: parsed.data.listingIds
              ? { set: parsed.data.listingIds.map((listingId) => ({ id: listingId })) }
              : undefined,
          },
          include: {
            listingsAssigned: { select: { id: true, listingCode: true, title: true } },
          },
        });

        if (parsed.data.optInStatus === false) {
          await cascadeOptOut(broker.phoneE164, "broker");
        } else if (parsed.data.optInStatus === true) {
          await cascadeOptIn(broker.phoneE164, "broker");
        }

        return broker;
      } catch {
        return reply.status(404).send({ error: "Broker not found" });
      }
    },
  );
};
