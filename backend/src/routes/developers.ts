import type { FastifyPluginAsync } from "fastify";
import {
  ActiveStatus,
  AvailabilityStatus,
  PropertyCategory,
  ProjectStatus,
  TransactionType,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { nextCode } from "../lib/ids.js";
import { normalizePhone } from "../lib/phone.js";
import { cascadeOptIn, cascadeOptOut } from "../lib/suppression.js";
import { requirePermission } from "../plugins/auth.js";

const developerBody = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  email: z.string().email().optional().nullable(),
  companyName: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  optInStatus: z.boolean().optional(),
  activeStatus: z.nativeEnum(ActiveStatus).optional(),
});

const projectBody = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  status: z.nativeEnum(ProjectStatus).optional(),
  description: z.string().optional().nullable(),
  completionDate: z.string().datetime().optional().nullable(),
});

const bulkListingBody = z.object({
  titlePrefix: z.string().min(1),
  unitNumbers: z.array(z.string().min(1)).min(1).max(100),
  price: z.number().positive(),
  currency: z.string().default("BDT"),
  bedrooms: z.number().int().optional().nullable(),
  bathrooms: z.number().int().optional().nullable(),
  sizeValue: z.number().optional().nullable(),
  sizeUnit: z.string().optional().nullable(),
  amenities: z.array(z.string()).optional(),
  description: z.string().optional().nullable(),
});

export const developerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/developers", { preHandler: requirePermission("contacts:read") }, async () => {
    const data = await prisma.developer.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { projects: true, prospects: true } },
      },
    });
    return { data };
  });

  app.get(
    "/developers/:id",
    { preHandler: requirePermission("contacts:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const developer = await prisma.developer.findUnique({
        where: { id },
        include: {
          projects: {
            include: { _count: { select: { listings: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      });
      if (!developer) return reply.status(404).send({ error: "Not found" });
      return developer;
    },
  );

  app.post(
    "/developers",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const parsed = developerBody.safeParse(request.body);
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
      const optInStatus = parsed.data.optInStatus ?? true;
      const developerCode = await nextCode("DEV", "developer");
      try {
        const developer = await prisma.developer.create({
          data: {
            developerCode,
            name: parsed.data.name,
            phone: parsed.data.phone,
            phoneE164,
            email: parsed.data.email ?? null,
            companyName: parsed.data.companyName ?? null,
            region: parsed.data.region ?? null,
            tags: parsed.data.tags ?? [],
            optInStatus,
            optInAt: optInStatus ? new Date() : null,
            optInSource: optInStatus ? "manual" : null,
            activeStatus: parsed.data.activeStatus ?? ActiveStatus.ACTIVE,
          },
        });
        if (!optInStatus) {
          await cascadeOptOut(phoneE164, "developer");
        }
        return reply.status(201).send(developer);
      } catch {
        return reply.status(409).send({ error: "Developer phone already exists" });
      }
    },
  );

  app.patch(
    "/developers/:id",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = developerBody.partial().safeParse(request.body);
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
        const developer = await prisma.developer.update({
          where: { id },
          data: {
            name: parsed.data.name,
            phone: parsed.data.phone,
            phoneE164,
            email: parsed.data.email === undefined ? undefined : parsed.data.email,
            companyName:
              parsed.data.companyName === undefined ? undefined : parsed.data.companyName,
            region: parsed.data.region === undefined ? undefined : parsed.data.region,
            tags: parsed.data.tags,
            optInStatus: parsed.data.optInStatus,
            activeStatus: parsed.data.activeStatus,
          },
        });
        if (parsed.data.optInStatus === false) {
          await cascadeOptOut(developer.phoneE164, "developer");
        } else if (parsed.data.optInStatus === true) {
          await cascadeOptIn(developer.phoneE164, "developer");
        }
        return developer;
      } catch {
        return reply.status(404).send({ error: "Not found" });
      }
    },
  );

  app.get(
    "/developers/:id/projects",
    { preHandler: requirePermission("contacts:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const developer = await prisma.developer.findUnique({ where: { id } });
      if (!developer) return reply.status(404).send({ error: "Not found" });
      const data = await prisma.project.findMany({
        where: { developerId: id },
        include: { _count: { select: { listings: true } } },
        orderBy: { createdAt: "desc" },
      });
      return { data };
    },
  );

  app.post(
    "/developers/:id/projects",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const developer = await prisma.developer.findUnique({ where: { id } });
      if (!developer) return reply.status(404).send({ error: "Not found" });
      const parsed = projectBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const projectCode = await nextCode("PRJ", "project");
      const project = await prisma.project.create({
        data: {
          projectCode,
          name: parsed.data.name,
          location: parsed.data.location,
          status: parsed.data.status ?? ProjectStatus.PLANNING,
          description: parsed.data.description ?? null,
          completionDate: parsed.data.completionDate
            ? new Date(parsed.data.completionDate)
            : null,
          developerId: id,
        },
      });
      return reply.status(201).send(project);
    },
  );

  app.patch(
    "/projects/:id",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = projectBody.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        return await prisma.project.update({
          where: { id },
          data: {
            name: parsed.data.name,
            location: parsed.data.location,
            status: parsed.data.status,
            description:
              parsed.data.description === undefined ? undefined : parsed.data.description,
            completionDate:
              parsed.data.completionDate === undefined
                ? undefined
                : parsed.data.completionDate
                  ? new Date(parsed.data.completionDate)
                  : null,
          },
        });
      } catch {
        return reply.status(404).send({ error: "Not found" });
      }
    },
  );

  app.get(
    "/projects/:id",
    { preHandler: requirePermission("contacts:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          developer: true,
          listings: {
            where: { archivedAt: null },
            orderBy: { createdAt: "desc" },
            take: 100,
          },
        },
      });
      if (!project) return reply.status(404).send({ error: "Not found" });
      return {
        ...project,
        listings: project.listings.map((l) => ({
          ...l,
          price: l.price.toString(),
        })),
      };
    },
  );

  app.post(
    "/projects/:id/listings/bulk",
    { preHandler: requirePermission("listings:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const project = await prisma.project.findUnique({ where: { id } });
      if (!project) return reply.status(404).send({ error: "Project not found" });

      const parsed = bulkListingBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const created = [];
      for (const unit of parsed.data.unitNumbers) {
        const listingCode = await nextCode("LST", "listing");
        const listing = await prisma.listing.create({
          data: {
            listingCode,
            title: `${parsed.data.titlePrefix} ${unit}`.trim(),
            propertyCategory: PropertyCategory.PRE_LAUNCH,
            transactionType: TransactionType.SALE,
            location: project.location,
            price: parsed.data.price,
            currency: parsed.data.currency,
            bedrooms: parsed.data.bedrooms ?? null,
            bathrooms: parsed.data.bathrooms ?? null,
            sizeValue: parsed.data.sizeValue ?? null,
            sizeUnit: parsed.data.sizeUnit ?? null,
            availabilityStatus: AvailabilityStatus.COMING_SOON,
            amenities: parsed.data.amenities ?? [],
            description:
              parsed.data.description ?? `Pre-launch unit ${unit} in ${project.name}`,
            projectId: project.id,
          },
        });
        created.push({
          id: listing.id,
          listingCode: listing.listingCode,
          title: listing.title,
          price: listing.price.toString(),
        });
      }

      if (project.status === ProjectStatus.PLANNING) {
        await prisma.project.update({
          where: { id },
          data: { status: ProjectStatus.PRE_LAUNCH },
        });
      }

      return reply.status(201).send({ created, count: created.length });
    },
  );
};
