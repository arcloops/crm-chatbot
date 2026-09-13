import type { FastifyPluginAsync } from "fastify";
import { CustomerTransactionType, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { nextCode } from "../lib/ids.js";
import { normalizePhone } from "../lib/phone.js";
import { cascadeOptIn, cascadeOptOut } from "../lib/suppression.js";
import { requirePermission } from "../plugins/auth.js";

const customerBodySchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  email: z.string().email().optional().nullable(),
  transactionType: z.nativeEnum(CustomerTransactionType),
  transactionDate: z.string().datetime().optional().nullable(),
  listingId: z.string().optional().nullable(),
  assignedBrokerId: z.string().optional().nullable(),
  referralCount: z.coerce.number().int().nonnegative().optional(),
  optInStatus: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

function serializeCustomer(customer: {
  budgetMin?: { toString(): string } | null;
  budgetMax?: { toString(): string } | null;
  [key: string]: unknown;
}) {
  return customer;
}

export const customerRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/customers",
    { preHandler: requirePermission("contacts:read") },
    async (request) => {
      const q = request.query as Record<string, string | undefined>;
      const where: Prisma.CustomerWhereInput = {};

      if (q.name) where.name = { contains: q.name, mode: "insensitive" };
      if (q.tag) where.tags = { has: q.tag };
      if (q.transactionType) {
        where.transactionType = q.transactionType as CustomerTransactionType;
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
          { customerCode: { contains: q.search, mode: "insensitive" } },
        ];
      }

      const data = await prisma.customer.findMany({
        where,
        include: {
          listing: { select: { id: true, listingCode: true, title: true } },
          assignedBroker: { select: { id: true, name: true, phoneE164: true } },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(Number(q.limit ?? 100), 200),
      });
      return { data: data.map(serializeCustomer) };
    },
  );

  app.get(
    "/customers/:id",
    { preHandler: requirePermission("contacts:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const customer = await prisma.customer.findUnique({
        where: { id },
        include: { listing: true, assignedBroker: true },
      });
      if (!customer) return reply.status(404).send({ error: "Customer not found" });
      return customer;
    },
  );

  app.post(
    "/customers",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const parsed = customerBodySchema.safeParse(request.body);
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

      const customerCode = await nextCode("CUS", "customer");
      const optInStatus = parsed.data.optInStatus ?? true;

      try {
        const customer = await prisma.customer.create({
          data: {
            customerCode,
            name: parsed.data.name,
            phone: parsed.data.phone,
            phoneE164,
            email: parsed.data.email ?? null,
            transactionType: parsed.data.transactionType,
            transactionDate: parsed.data.transactionDate
              ? new Date(parsed.data.transactionDate)
              : null,
            listingId: parsed.data.listingId ?? null,
            assignedBrokerId: parsed.data.assignedBrokerId ?? null,
            referralCount: parsed.data.referralCount ?? 0,
            optInStatus,
            tags: parsed.data.tags ?? [],
          },
          include: {
            listing: { select: { id: true, listingCode: true, title: true } },
            assignedBroker: { select: { id: true, name: true } },
          },
        });

        if (!optInStatus) {
          await cascadeOptOut(phoneE164, "customer");
        }

        return reply.status(201).send(customer);
      } catch {
        return reply.status(409).send({ error: "Customer phone already exists" });
      }
    },
  );

  app.patch(
    "/customers/:id",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = customerBodySchema.partial().safeParse(request.body);
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
        const customer = await prisma.customer.update({
          where: { id },
          data: {
            name: parsed.data.name,
            phone: parsed.data.phone,
            phoneE164,
            email: parsed.data.email === undefined ? undefined : parsed.data.email,
            transactionType: parsed.data.transactionType,
            transactionDate:
              parsed.data.transactionDate === undefined
                ? undefined
                : parsed.data.transactionDate
                  ? new Date(parsed.data.transactionDate)
                  : null,
            listingId:
              parsed.data.listingId === undefined ? undefined : parsed.data.listingId,
            assignedBrokerId:
              parsed.data.assignedBrokerId === undefined
                ? undefined
                : parsed.data.assignedBrokerId,
            referralCount: parsed.data.referralCount,
            optInStatus: parsed.data.optInStatus,
            tags: parsed.data.tags,
          },
          include: {
            listing: { select: { id: true, listingCode: true, title: true } },
            assignedBroker: { select: { id: true, name: true } },
          },
        });

        if (parsed.data.optInStatus === false) {
          await cascadeOptOut(customer.phoneE164, "customer");
        } else if (parsed.data.optInStatus === true) {
          await cascadeOptIn(customer.phoneE164, "customer");
        }

        return customer;
      } catch {
        return reply.status(404).send({ error: "Customer not found" });
      }
    },
  );
};
