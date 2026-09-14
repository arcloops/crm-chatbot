import type { FastifyPluginAsync } from "fastify";
import {
  AvailabilityStatus,
  PropertyCategory,
  TransactionType,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { nextCode } from "../lib/ids.js";
import { requirePermission } from "../plugins/auth.js";

const photoUrl = z.string().url();

const listingBodySchema = z
  .object({
    title: z.string().min(1),
    propertyCategory: z.nativeEnum(PropertyCategory),
    transactionType: z.nativeEnum(TransactionType),
    location: z.string().min(1),
    latitude: z.number().optional().nullable(),
    longitude: z.number().optional().nullable(),
    price: z.coerce.number().positive(),
    currency: z.string().default("BDT"),
    sizeValue: z.coerce.number().optional().nullable(),
    sizeUnit: z.string().optional().nullable(),
    bedrooms: z.coerce.number().int().optional().nullable(),
    bathrooms: z.coerce.number().int().optional().nullable(),
    availabilityStatus: z.nativeEnum(AvailabilityStatus).optional(),
    amenities: z.array(z.string()).optional(),
    photos: z.array(photoUrl).optional(),
    description: z.string().optional().nullable(),
    brokerId: z.string().optional().nullable(),
    installmentPlan: z.unknown().optional().nullable(),
    zoning: z.string().optional().nullable(),
    floorNumber: z.coerce.number().int().optional().nullable(),
    yearBuilt: z.coerce.number().int().optional().nullable(),
    completionDate: z.string().datetime().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (
      data.installmentPlan != null &&
      data.propertyCategory !== PropertyCategory.PRE_LAUNCH
    ) {
      ctx.addIssue({
        code: "custom",
        message: "installmentPlan is only allowed for PRE_LAUNCH listings",
        path: ["installmentPlan"],
      });
    }
  });

function serializeListing(listing: {
  price: { toString(): string };
  [key: string]: unknown;
}) {
  return {
    ...listing,
    price: listing.price.toString(),
  };
}

export const listingRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/locations",
    { preHandler: requirePermission("listings:read") },
    async () => {
      const data = await prisma.locationArea.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      });
      return { data };
    },
  );

  app.get(
    "/listings",
    { preHandler: requirePermission("listings:read") },
    async (request) => {
      const q = request.query as Record<string, string | undefined>;
      const where: Prisma.ListingWhereInput = {
        archivedAt: q.includeArchived === "true" ? undefined : null,
      };

      if (q.status) where.availabilityStatus = q.status as AvailabilityStatus;
      if (q.category) where.propertyCategory = q.category as PropertyCategory;
      if (q.transactionType) {
        where.transactionType = q.transactionType as TransactionType;
      }
      if (q.location) {
        where.location = { contains: q.location, mode: "insensitive" };
      }
      if (q.bedrooms) where.bedrooms = Number(q.bedrooms);
      if (q.minPrice || q.maxPrice) {
        where.price = {};
        if (q.minPrice) where.price.gte = q.minPrice;
        if (q.maxPrice) where.price.lte = q.maxPrice;
      }
      if (q.search) {
        where.OR = [
          { title: { contains: q.search, mode: "insensitive" } },
          { listingCode: { contains: q.search, mode: "insensitive" } },
          { location: { contains: q.search, mode: "insensitive" } },
        ];
      }
      if (q.activeOnly === "true") {
        where.availabilityStatus = {
          in: [
            AvailabilityStatus.AVAILABLE,
            AvailabilityStatus.RESERVED,
            AvailabilityStatus.UNDER_OFFER,
            AvailabilityStatus.COMING_SOON,
          ],
        };
      }

      const data = await prisma.listing.findMany({
        where,
        include: { broker: { select: { id: true, name: true, phoneE164: true } } },
        orderBy: { lastUpdated: "desc" },
        take: Math.min(Number(q.limit ?? 100), 200),
      });

      return { data: data.map(serializeListing) };
    },
  );

  app.get(
    "/listings/:id",
    { preHandler: requirePermission("listings:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const listing = await prisma.listing.findUnique({
        where: { id },
        include: { broker: true, assignedBrokers: true },
      });
      if (!listing) return reply.status(404).send({ error: "Listing not found" });
      return serializeListing(listing);
    },
  );

  app.post(
    "/listings",
    { preHandler: requirePermission("listings:write") },
    async (request, reply) => {
      const parsed = listingBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const listingCode = await nextCode("LST", "listing");
      const listing = await prisma.listing.create({
        data: {
          listingCode,
          title: parsed.data.title,
          propertyCategory: parsed.data.propertyCategory,
          transactionType: parsed.data.transactionType,
          location: parsed.data.location,
          latitude: parsed.data.latitude ?? null,
          longitude: parsed.data.longitude ?? null,
          price: parsed.data.price,
          currency: parsed.data.currency,
          sizeValue: parsed.data.sizeValue ?? null,
          sizeUnit: parsed.data.sizeUnit ?? null,
          bedrooms: parsed.data.bedrooms ?? null,
          bathrooms: parsed.data.bathrooms ?? null,
          availabilityStatus:
            parsed.data.availabilityStatus ?? AvailabilityStatus.AVAILABLE,
          amenities: parsed.data.amenities ?? [],
          photos: parsed.data.photos ?? [],
          description: parsed.data.description ?? null,
          brokerId: parsed.data.brokerId ?? null,
          installmentPlan:
            parsed.data.installmentPlan === null ||
            parsed.data.installmentPlan === undefined
              ? undefined
              : (parsed.data.installmentPlan as Prisma.InputJsonValue),
          zoning: parsed.data.zoning ?? null,
          floorNumber: parsed.data.floorNumber ?? null,
          yearBuilt: parsed.data.yearBuilt ?? null,
          completionDate: parsed.data.completionDate
            ? new Date(parsed.data.completionDate)
            : null,
        },
      });

      return reply.status(201).send(serializeListing(listing));
    },
  );

  app.patch(
    "/listings/:id",
    { preHandler: requirePermission("listings:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = listingBodySchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      if (parsed.data.installmentPlan != null) {
        const existing = await prisma.listing.findUnique({ where: { id } });
        if (!existing) return reply.status(404).send({ error: "Listing not found" });
        const category = parsed.data.propertyCategory ?? existing.propertyCategory;
        if (category !== PropertyCategory.PRE_LAUNCH) {
          return reply.status(400).send({
            error: "installmentPlan is only allowed for PRE_LAUNCH listings",
          });
        }
      }

      try {
        const listing = await prisma.listing.update({
          where: { id },
          data: {
            ...parsed.data,
            completionDate:
              parsed.data.completionDate === undefined
                ? undefined
                : parsed.data.completionDate
                  ? new Date(parsed.data.completionDate)
                  : null,
            installmentPlan:
              parsed.data.installmentPlan === undefined
                ? undefined
                : (parsed.data.installmentPlan as Prisma.InputJsonValue),
          },
        });
        return serializeListing(listing);
      } catch {
        return reply.status(404).send({ error: "Listing not found" });
      }
    },
  );

  app.post(
    "/listings/:id/archive",
    { preHandler: requirePermission("listings:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const listing = await prisma.listing.update({
          where: { id },
          data: { archivedAt: new Date() },
        });
        return serializeListing(listing);
      } catch {
        return reply.status(404).send({ error: "Listing not found" });
      }
    },
  );
};
