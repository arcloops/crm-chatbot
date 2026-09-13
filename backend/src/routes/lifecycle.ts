import type { FastifyPluginAsync } from "fastify";
import {
  AvailabilityStatus,
  CustomerTransactionType,
  LeadStage,
  ProspectIntent,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { nextCode } from "../lib/ids.js";
import { normalizePhone } from "../lib/phone.js";
import { cascadeOptOut } from "../lib/suppression.js";
import { requirePermission } from "../plugins/auth.js";

const convertSchema = z.object({
  transactionType: z.nativeEnum(CustomerTransactionType),
  transactionDate: z.string().datetime().optional(),
  listingId: z.string().optional().nullable(),
});

const viewingSchema = z.object({
  viewingAt: z.string().datetime().optional(),
  viewingNote: z.string().optional().nullable(),
});

const referralSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  preferredLocation: z.string().optional().nullable(),
  intent: z.nativeEnum(ProspectIntent).optional().nullable(),
  assignedBrokerId: z.string().optional().nullable(),
});

const reassignSchema = z.object({
  fromBrokerId: z.string().min(1),
  toBrokerId: z.string().min(1),
  scopes: z
    .array(z.enum(["listings", "prospects", "customers"]))
    .min(1)
    .default(["listings", "prospects", "customers"]),
});

export const lifecycleRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/prospects/:id/convert",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = convertSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const prospect = await prisma.prospect.findUnique({ where: { id } });
      if (!prospect) return reply.status(404).send({ error: "Prospect not found" });
      if (prospect.convertedAt) {
        return reply.status(409).send({ error: "Prospect already converted" });
      }

      // Customer phone must be unique — if already customer, fail clearly
      const existingCustomer = await prisma.customer.findUnique({
        where: { phoneE164: prospect.phoneE164 },
      });
      if (existingCustomer) {
        return reply.status(409).send({
          error: "A customer with this phone already exists",
          customerId: existingCustomer.id,
        });
      }

      const customerCode = await nextCode("CUS", "customer");
      const [customer] = await prisma.$transaction([
        prisma.customer.create({
          data: {
            customerCode,
            name: prospect.name,
            phone: prospect.phone,
            phoneE164: prospect.phoneE164,
            transactionType: parsed.data.transactionType,
            transactionDate: parsed.data.transactionDate
              ? new Date(parsed.data.transactionDate)
              : new Date(),
            listingId: parsed.data.listingId ?? null,
            assignedBrokerId: prospect.assignedBrokerId,
            optInStatus: prospect.optInStatus,
            tags: prospect.tags,
          },
        }),
        prisma.prospect.update({
          where: { id },
          data: { convertedAt: new Date(), leadStage: LeadStage.QUALIFIED },
        }),
      ]);

      return reply.status(201).send({ customer, prospectId: id });
    },
  );

  app.post(
    "/prospects/:id/viewing",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = viewingSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        const prospect = await prisma.prospect.update({
          where: { id },
          data: {
            leadStage: LeadStage.VIEWING_BOOKED,
            viewingAt: parsed.data.viewingAt
              ? new Date(parsed.data.viewingAt)
              : new Date(),
            viewingNote: parsed.data.viewingNote ?? null,
            lastInteractionDate: new Date(),
          },
          include: { assignedBroker: { select: { id: true, name: true } } },
        });
        return prospect;
      } catch {
        return reply.status(404).send({ error: "Prospect not found" });
      }
    },
  );

  app.post(
    "/customers/:id/referrals",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = referralSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) return reply.status(404).send({ error: "Customer not found" });

      let phoneE164: string;
      try {
        phoneE164 = normalizePhone(parsed.data.phone);
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "Invalid phone",
        });
      }

      const existing = await prisma.prospect.findUnique({ where: { phoneE164 } });
      if (existing) {
        return reply
          .status(409)
          .send({ error: "Prospect with this phone already exists" });
      }

      const prospectCode = await nextCode("PRS", "prospect");
      const prospect = await prisma.$transaction(async (tx) => {
        const created = await tx.prospect.create({
          data: {
            prospectCode,
            name: parsed.data.name,
            phone: parsed.data.phone,
            phoneE164,
            preferredLocation: parsed.data.preferredLocation ?? null,
            intent: parsed.data.intent ?? null,
            leadSource: "referral",
            leadStage: LeadStage.NEW,
            assignedBrokerId: parsed.data.assignedBrokerId ?? customer.assignedBrokerId,
            referredByCustomerId: customer.id,
            optInStatus: true,
            tags: ["referral"],
          },
        });
        await tx.customer.update({
          where: { id: customer.id },
          data: { referralCount: { increment: 1 } },
        });
        return created;
      });

      return reply.status(201).send(prospect);
    },
  );

  // Register static path before /brokers/:id consumers — dedicated path
  app.post(
    "/brokers/reassign",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const parsed = reassignSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { fromBrokerId, toBrokerId, scopes } = parsed.data;
      if (fromBrokerId === toBrokerId) {
        return reply.status(400).send({ error: "from and to broker must differ" });
      }

      const [from, to] = await Promise.all([
        prisma.broker.findUnique({ where: { id: fromBrokerId } }),
        prisma.broker.findUnique({ where: { id: toBrokerId } }),
      ]);
      if (!from || !to) {
        return reply.status(404).send({ error: "Broker not found" });
      }

      const result = { listings: 0, prospects: 0, customers: 0 };

      if (scopes.includes("listings")) {
        const owned = await prisma.listing.updateMany({
          where: { brokerId: fromBrokerId },
          data: { brokerId: toBrokerId },
        });
        result.listings = owned.count;

        // M2M: move assigned listings
        const assigned = await prisma.listing.findMany({
          where: { assignedBrokers: { some: { id: fromBrokerId } } },
          select: { id: true },
        });
        for (const listing of assigned) {
          await prisma.listing.update({
            where: { id: listing.id },
            data: {
              assignedBrokers: {
                disconnect: { id: fromBrokerId },
                connect: { id: toBrokerId },
              },
            },
          });
        }
        result.listings += assigned.length;
      }

      if (scopes.includes("prospects")) {
        const r = await prisma.prospect.updateMany({
          where: { assignedBrokerId: fromBrokerId, convertedAt: null },
          data: { assignedBrokerId: toBrokerId },
        });
        result.prospects = r.count;
      }

      if (scopes.includes("customers")) {
        const r = await prisma.customer.updateMany({
          where: { assignedBrokerId: fromBrokerId },
          data: { assignedBrokerId: toBrokerId },
        });
        result.customers = r.count;
      }

      return { fromBrokerId, toBrokerId, moved: result };
    },
  );

  app.get(
    "/brokers/:id/workload",
    { preHandler: requirePermission("contacts:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const broker = await prisma.broker.findUnique({ where: { id } });
      if (!broker) return reply.status(404).send({ error: "Broker not found" });

      const [prospects, ownedListings, assignedListings] = await Promise.all([
        prisma.prospect.findMany({
          where: { assignedBrokerId: id, convertedAt: null },
          select: {
            id: true,
            prospectCode: true,
            name: true,
            leadStage: true,
            phoneE164: true,
          },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.listing.findMany({
          where: {
            brokerId: id,
            archivedAt: null,
            availabilityStatus: {
              in: [
                AvailabilityStatus.AVAILABLE,
                AvailabilityStatus.RESERVED,
                AvailabilityStatus.UNDER_OFFER,
                AvailabilityStatus.COMING_SOON,
              ],
            },
          },
          select: {
            id: true,
            listingCode: true,
            title: true,
            availabilityStatus: true,
          },
        }),
        prisma.listing.findMany({
          where: {
            assignedBrokers: { some: { id } },
            archivedAt: null,
          },
          select: {
            id: true,
            listingCode: true,
            title: true,
            availabilityStatus: true,
          },
        }),
      ]);

      const byStage: Record<string, number> = {};
      for (const stage of Object.values(LeadStage)) byStage[stage] = 0;
      for (const p of prospects) byStage[p.leadStage] += 1;

      return {
        broker: { id: broker.id, name: broker.name, brokerCode: broker.brokerCode },
        prospects,
        prospectsByStage: byStage,
        activeListings: ownedListings,
        assignedListings,
        counts: {
          openProspects: prospects.length,
          activeListings: ownedListings.length,
          assignedListings: assignedListings.length,
        },
      };
    },
  );

  app.post(
    "/suppression/cascade",
    { preHandler: requirePermission("suppression:write") },
    async (request, reply) => {
      const parsed = z
        .object({ phone: z.string().min(5), source: z.string().optional() })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid phone payload" });
      }
      try {
        const result = await cascadeOptOut(
          parsed.data.phone,
          parsed.data.source ?? "cascade",
        );
        return result;
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "Cascade failed",
        });
      }
    },
  );
};
