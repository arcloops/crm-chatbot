import type { FastifyPluginAsync } from "fastify";
import {
  AvailabilityStatus,
  BrokerSpecialization,
  CustomerTransactionType,
  LeadStage,
  PropertyCategory,
  ProspectIntent,
  TransactionType,
} from "@prisma/client";
import { z } from "zod";
import { parseBool, parseCsv, splitTags } from "../lib/csv.js";
import { prisma } from "../lib/db.js";
import { nextCode } from "../lib/ids.js";
import { normalizePhone } from "../lib/phone.js";
import { cascadeOptOut } from "../lib/suppression.js";
import { authenticate, requirePermission } from "../plugins/auth.js";

const importBody = z.object({
  csv: z.string().min(1),
});

type RowResult = {
  row: number;
  ok: boolean;
  id?: string;
  code?: string;
  error?: string;
};

function enumOr<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!value) return fallback;
  const upper = value.trim().toUpperCase().replace(/\s+/g, "_") as T;
  return allowed.includes(upper) ? upper : fallback;
}

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.get("/import/templates", { preHandler: authenticate }, async () => ({
      listings: {
        headers: [
          "title",
          "propertyCategory",
          "transactionType",
          "location",
          "price",
          "currency",
          "bedrooms",
          "bathrooms",
          "availabilityStatus",
          "description",
          "amenities",
        ],
        sample:
          "title,propertyCategory,transactionType,location,price,currency,bedrooms,bathrooms,availabilityStatus,description,amenities\n" +
          "Gulshan 3BR,APARTMENT,SALE,Gulshan,8500000,BDT,3,3,AVAILABLE,Sunny corner unit,parking|generator",
      },
      brokers: {
        headers: ["name", "phone", "email", "regionArea", "specialization", "optInStatus", "tags"],
        sample:
          "name,phone,email,regionArea,specialization,optInStatus,tags\n" +
          "Karim Broker,01711000999,karim@example.com,Banani,RESIDENTIAL,true,vip|dhaka",
      },
      customers: {
        headers: [
          "name",
          "phone",
          "email",
          "transactionType",
          "optInStatus",
          "tags",
        ],
        sample:
          "name,phone,email,transactionType,optInStatus,tags\n" +
          "Sadia Customer,01711000888,sadia@example.com,BOUGHT,true,high-value",
      },
      prospects: {
        headers: [
          "name",
          "phone",
          "preferredLocation",
          "intent",
          "leadStage",
          "leadSource",
          "budgetMax",
          "optInStatus",
          "tags",
        ],
        sample:
          "name,phone,preferredLocation,intent,leadStage,leadSource,budgetMax,optInStatus,tags\n" +
          "Rafi Prospect,01711000777,Banani,BUY,NEW,csv_import,9000000,true,hot",
      },
      suppression: {
        headers: ["phone", "source"],
        sample: "phone,source\n" + "01711000666,csv_import\n" + "8801711000555,manual_list",
      },
    }),
  );

  app.post(
    "/import/listings",
    { preHandler: requirePermission("listings:write") },
    async (request, reply) => {
      const parsed = importBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "csv string required" });
      }
      const { rows } = parseCsv(parsed.data.csv);
      if (!rows.length) {
        return reply.status(400).send({ error: "No data rows in CSV" });
      }
      if (rows.length > 500) {
        return reply.status(400).send({ error: "Max 500 rows per import" });
      }

      const results: RowResult[] = [];
      let created = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        try {
          const title = row.title || row.Title;
          const location = row.location || row.Location;
          const price = Number(row.price || row.Price);
          if (!title || !location || !Number.isFinite(price) || price <= 0) {
            throw new Error("title, location, and positive price are required");
          }

          const listingCode = await nextCode("LST", "listing");
          const listing = await prisma.listing.create({
            data: {
              listingCode,
              title,
              propertyCategory: enumOr(
                row.propertyCategory || row.category,
                Object.values(PropertyCategory),
                PropertyCategory.APARTMENT,
              ),
              transactionType: enumOr(
                row.transactionType,
                Object.values(TransactionType),
                TransactionType.SALE,
              ),
              location,
              price,
              currency: row.currency || "BDT",
              bedrooms: row.bedrooms ? Number(row.bedrooms) : null,
              bathrooms: row.bathrooms ? Number(row.bathrooms) : null,
              sizeValue: row.sizeValue ? Number(row.sizeValue) : null,
              sizeUnit: row.sizeUnit || null,
              availabilityStatus: enumOr(
                row.availabilityStatus || row.status,
                Object.values(AvailabilityStatus),
                AvailabilityStatus.AVAILABLE,
              ),
              description: row.description || null,
              amenities: splitTags(row.amenities),
              photos: splitTags(row.photos).filter((u) => /^https?:\/\//i.test(u)),
            },
          });
          created++;
          results.push({
            row: rowNum,
            ok: true,
            id: listing.id,
            code: listing.listingCode,
          });
        } catch (error) {
          results.push({
            row: rowNum,
            ok: false,
            error: error instanceof Error ? error.message : "Failed",
          });
        }
      }

      return {
        type: "listings",
        total: rows.length,
        created,
        failed: rows.length - created,
        results,
      };
    },
  );

  app.post(
    "/import/brokers",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const parsed = importBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "csv string required" });
      }
      const { rows } = parseCsv(parsed.data.csv);
      if (!rows.length) {
        return reply.status(400).send({ error: "No data rows in CSV" });
      }
      if (rows.length > 500) {
        return reply.status(400).send({ error: "Max 500 rows per import" });
      }

      const results: RowResult[] = [];
      let created = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        try {
          const name = row.name || row.Name;
          const phone = row.phone || row.Phone;
          if (!name || !phone) throw new Error("name and phone are required");
          const phoneE164 = normalizePhone(phone);
          const optInStatus = parseBool(row.optInStatus, true);
          const brokerCode = await nextCode("BRK", "broker");

          const specializationRaw = (row.specialization || "").toUpperCase();
          const specialization = Object.values(BrokerSpecialization).includes(
            specializationRaw as BrokerSpecialization,
          )
            ? (specializationRaw as BrokerSpecialization)
            : null;

          const broker = await prisma.broker.create({
            data: {
              brokerCode,
              name,
              phone,
              phoneE164,
              email: row.email || null,
              regionArea: row.regionArea || row.region || null,
              specialization,
              optInStatus,
              optInAt: optInStatus ? new Date() : null,
              optInSource: optInStatus ? "csv_import" : null,
              tags: splitTags(row.tags),
            },
          });
          created++;
          results.push({
            row: rowNum,
            ok: true,
            id: broker.id,
            code: broker.brokerCode,
          });
        } catch (error) {
          results.push({
            row: rowNum,
            ok: false,
            error: error instanceof Error ? error.message : "Failed",
          });
        }
      }

      return {
        type: "brokers",
        total: rows.length,
        created,
        failed: rows.length - created,
        results,
      };
    },
  );

  app.post(
    "/import/customers",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const parsed = importBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "csv string required" });
      }
      const { rows } = parseCsv(parsed.data.csv);
      if (!rows.length) {
        return reply.status(400).send({ error: "No data rows in CSV" });
      }
      if (rows.length > 500) {
        return reply.status(400).send({ error: "Max 500 rows per import" });
      }

      const results: RowResult[] = [];
      let created = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        try {
          const name = row.name || row.Name;
          const phone = row.phone || row.Phone;
          if (!name || !phone) throw new Error("name and phone are required");
          const phoneE164 = normalizePhone(phone);
          const optInStatus = parseBool(row.optInStatus, true);
          const customerCode = await nextCode("CUS", "customer");

          const customer = await prisma.customer.create({
            data: {
              customerCode,
              name,
              phone,
              phoneE164,
              email: row.email || null,
              transactionType: enumOr(
                row.transactionType,
                Object.values(CustomerTransactionType),
                CustomerTransactionType.BOUGHT,
              ),
              optInStatus,
              optInAt: optInStatus ? new Date() : null,
              optInSource: optInStatus ? "csv_import" : null,
              tags: splitTags(row.tags),
            },
          });
          created++;
          results.push({
            row: rowNum,
            ok: true,
            id: customer.id,
            code: customer.customerCode,
          });
        } catch (error) {
          results.push({
            row: rowNum,
            ok: false,
            error: error instanceof Error ? error.message : "Failed",
          });
        }
      }

      return {
        type: "customers",
        total: rows.length,
        created,
        failed: rows.length - created,
        results,
      };
    },
  );

  app.post(
    "/import/prospects",
    { preHandler: requirePermission("contacts:write") },
    async (request, reply) => {
      const parsed = importBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "csv string required" });
      }
      const { rows } = parseCsv(parsed.data.csv);
      if (!rows.length) {
        return reply.status(400).send({ error: "No data rows in CSV" });
      }
      if (rows.length > 500) {
        return reply.status(400).send({ error: "Max 500 rows per import" });
      }

      const results: RowResult[] = [];
      let created = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        try {
          const name = row.name || row.Name;
          const phone = row.phone || row.Phone;
          if (!name || !phone) throw new Error("name and phone are required");
          const phoneE164 = normalizePhone(phone);
          const optInStatus = parseBool(row.optInStatus, true);
          const prospectCode = await nextCode("PRS", "prospect");

          const prospect = await prisma.prospect.create({
            data: {
              prospectCode,
              name,
              phone,
              phoneE164,
              preferredLocation: row.preferredLocation || row.location || null,
              intent: enumOr(
                row.intent,
                Object.values(ProspectIntent),
                ProspectIntent.BUY,
              ),
              leadStage: enumOr(
                row.leadStage || row.stage,
                Object.values(LeadStage),
                LeadStage.NEW,
              ),
              leadSource: row.leadSource || "csv_import",
              budgetMax: row.budgetMax ? Number(row.budgetMax) : null,
              budgetMin: row.budgetMin ? Number(row.budgetMin) : null,
              optInStatus,
              optInAt: optInStatus ? new Date() : null,
              optInSource: optInStatus ? "csv_import" : null,
              tags: splitTags(row.tags),
            },
          });
          created++;
          results.push({
            row: rowNum,
            ok: true,
            id: prospect.id,
            code: prospect.prospectCode,
          });
        } catch (error) {
          results.push({
            row: rowNum,
            ok: false,
            error: error instanceof Error ? error.message : "Failed",
          });
        }
      }

      return {
        type: "prospects",
        total: rows.length,
        created,
        failed: rows.length - created,
        results,
      };
    },
  );

  app.post(
    "/import/suppression",
    { preHandler: requirePermission("suppression:write") },
    async (request, reply) => {
      const parsed = importBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "csv string required" });
      }
      const { rows } = parseCsv(parsed.data.csv);
      if (!rows.length) {
        return reply.status(400).send({ error: "No data rows in CSV" });
      }
      if (rows.length > 500) {
        return reply.status(400).send({ error: "Max 500 rows per import" });
      }

      const results: RowResult[] = [];
      let created = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        try {
          const phone = row.phone || row.Phone;
          if (!phone) throw new Error("phone is required");
          const source = (row.source || row.Source || "csv_import").trim() || "csv_import";
          const cascade = await cascadeOptOut(phone, source);
          created++;
          results.push({
            row: rowNum,
            ok: true,
            id: cascade.phoneE164,
            code: cascade.phoneE164,
          });
        } catch (error) {
          results.push({
            row: rowNum,
            ok: false,
            error: error instanceof Error ? error.message : "Failed",
          });
        }
      }

      return {
        type: "suppression",
        total: rows.length,
        created,
        failed: rows.length - created,
        results,
      };
    },
  );
};
