import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { normalizePhone } from "../lib/phone.js";
import {
  cascadeOptIn,
  cascadeOptOut,
  isPhoneSuppressed,
} from "../lib/suppression.js";
import { requirePermission } from "../plugins/auth.js";

const phoneBodySchema = z.object({
  phone: z.string().min(5),
  source: z.string().optional(),
});

export const suppressionRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/suppression",
    { preHandler: requirePermission("suppression:read") },
    async (request) => {
      const q = request.query as Record<string, string | undefined>;
      const data = await prisma.suppressionEntry.findMany({
        where: q.phone
          ? {
              phoneE164: {
                contains: q.phone.startsWith("+") ? q.phone : q.phone,
              },
            }
          : undefined,
        orderBy: { optedOutDate: "desc" },
        take: Math.min(Number(q.limit ?? 100), 200),
      });
      return { data };
    },
  );

  app.post(
    "/suppression",
    { preHandler: requirePermission("suppression:write") },
    async (request, reply) => {
      const parsed = phoneBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid phone payload" });
      }

      try {
        normalizePhone(parsed.data.phone);
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "Invalid phone",
        });
      }

      const result = await cascadeOptOut(
        parsed.data.phone,
        parsed.data.source ?? "manual",
      );

      const entry = await prisma.suppressionEntry.findUniqueOrThrow({
        where: { phoneE164: result.phoneE164 },
      });
      return reply.status(201).send({ ...entry, cascade: result });
    },
  );

  app.delete(
    "/suppression/:phoneE164",
    { preHandler: requirePermission("suppression:write") },
    async (request, reply) => {
      const raw = (request.params as { phoneE164: string }).phoneE164;
      const phoneE164 = decodeURIComponent(raw);

      const existing = await prisma.suppressionEntry.findUnique({
        where: { phoneE164 },
      });
      if (!existing) {
        return reply.status(404).send({ error: "Suppression entry not found" });
      }

      const restored = await cascadeOptIn(phoneE164, "suppression_remove");
      return { ok: true, phoneE164, cascade: restored };
    },
  );

  /** Campaign send gate stub (Phase 3 exit criteria). */
  app.post(
    "/suppression/check",
    { preHandler: requirePermission("suppression:read") },
    async (request, reply) => {
      const parsed = phoneBodySchema.pick({ phone: true }).safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid phone payload" });
      }

      let phoneE164: string;
      try {
        phoneE164 = normalizePhone(parsed.data.phone);
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "Invalid phone",
        });
      }

      const suppressed = await isPhoneSuppressed(phoneE164);
      if (suppressed) {
        return {
          allowed: false,
          suppressed: true,
          phoneE164,
          error: "Phone is on the suppression list",
        };
      }
      return { allowed: true, suppressed: false, phoneE164 };
    },
  );
};

export const contactUtilityRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/contacts/duplicates",
    { preHandler: requirePermission("contacts:read") },
    async (request, reply) => {
      const q = request.query as { phone?: string };
      if (!q.phone) {
        return reply.status(400).send({ error: "phone query required" });
      }

      let phoneE164: string;
      try {
        phoneE164 = normalizePhone(q.phone);
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : "Invalid phone",
        });
      }

      const [broker, customer, prospect, developer] = await Promise.all([
        prisma.broker.findUnique({
          where: { phoneE164 },
          select: { id: true, name: true, brokerCode: true },
        }),
        prisma.customer.findUnique({
          where: { phoneE164 },
          select: { id: true, name: true, customerCode: true },
        }),
        prisma.prospect.findUnique({
          where: { phoneE164 },
          select: { id: true, name: true, prospectCode: true },
        }),
        prisma.developer.findUnique({
          where: { phoneE164 },
          select: { id: true, name: true, developerCode: true },
        }),
      ]);

      return {
        phoneE164,
        matches: {
          broker,
          customer,
          prospect,
          developer,
        },
        duplicate: Boolean(broker || customer || prospect || developer),
      };
    },
  );
};
