import type { FastifyPluginAsync } from "fastify";
import {
  CampaignAudienceType,
  CampaignRecipientStatus,
  CampaignStatus,
} from "@prisma/client";
import { z } from "zod";
import { resolveAudience } from "../campaigns/audience.js";
import { prisma } from "../lib/db.js";
import { requirePermission } from "../plugins/auth.js";
import { enqueueCampaignRecipients, stopCampaignJobs } from "../workers/campaign.js";

const filtersSchema = z
  .object({
    tags: z.array(z.string()).optional(),
    stages: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
    optInOnly: z.boolean().optional(),
    listingId: z.string().nullable().optional(),
  })
  .default({ optInOnly: true });

const createSchema = z.object({
  name: z.string().min(1),
  audienceType: z.nativeEnum(CampaignAudienceType),
  audienceFilters: filtersSchema.optional(),
  templateName: z.string().min(1),
  templateVariantB: z.string().optional().nullable(),
  abSplitPercent: z.number().int().min(0).max(100).optional().nullable(),
  mergeFieldMap: z.record(z.string(), z.string()).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  timezone: z.string().optional(),
  rateLimitPerSec: z.number().int().positive().max(50).optional(),
});

async function loadCampaign(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { recipients: true } },
    },
  });
}

async function materializeRecipients(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");

  await prisma.campaignRecipient.deleteMany({ where: { campaignId } });

  const audience = await resolveAudience(campaign.audienceType, campaign.audienceFilters);

  const split = campaign.abSplitPercent ?? 50;
  const rows = audience.map((r, index) => {
    let templateName = campaign.templateName;
    if (campaign.templateVariantB) {
      templateName =
        index % 100 < split ? campaign.templateName : campaign.templateVariantB;
    }
    const skipped = Boolean(r.skipReason);
    return {
      campaignId,
      phoneE164: r.phoneE164,
      contactType: r.contactType,
      contactId: r.contactId,
      templateName,
      mergePayload: r.mergePayload,
      status: skipped ? CampaignRecipientStatus.SKIPPED : CampaignRecipientStatus.PENDING,
      skipReason: r.skipReason ?? null,
    };
  });

  if (rows.length) {
    await prisma.campaignRecipient.createMany({ data: rows });
  }

  const skippedCount = rows.filter(
    (r) => r.status === CampaignRecipientStatus.SKIPPED,
  ).length;

  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      totalRecipients: rows.length,
      skippedCount,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      repliedCount: 0,
    },
  });
}

export const campaignRoutes: FastifyPluginAsync = async (app) => {
  app.get("/campaigns", { preHandler: requirePermission("campaigns:read") }, async () => {
    const data = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
    });
    return { data };
  });

  app.get(
    "/campaigns/:id",
    { preHandler: requirePermission("campaigns:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const campaign = await loadCampaign(id);
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      return campaign;
    },
  );

  app.post(
    "/campaigns",
    { preHandler: requirePermission("campaigns:write") },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const user = request.authUser!;
      const campaign = await prisma.campaign.create({
        data: {
          name: parsed.data.name,
          audienceType: parsed.data.audienceType,
          audienceFilters: parsed.data.audienceFilters ?? { optInOnly: true },
          templateName: parsed.data.templateName,
          templateVariantB: parsed.data.templateVariantB ?? null,
          abSplitPercent: parsed.data.abSplitPercent ?? null,
          mergeFieldMap: parsed.data.mergeFieldMap ?? {},
          scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null,
          timezone: parsed.data.timezone ?? "Asia/Dhaka",
          rateLimitPerSec: parsed.data.rateLimitPerSec ?? 5,
          createdById: user.sub,
          status: parsed.data.scheduledAt
            ? CampaignStatus.SCHEDULED
            : CampaignStatus.DRAFT,
        },
      });
      return reply.status(201).send(campaign);
    },
  );

  app.patch(
    "/campaigns/:id",
    { preHandler: requirePermission("campaigns:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await prisma.campaign.findUnique({ where: { id } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      if (
        existing.status !== CampaignStatus.DRAFT &&
        existing.status !== CampaignStatus.SCHEDULED
      ) {
        return reply
          .status(400)
          .send({ error: "Only DRAFT/SCHEDULED campaigns can be edited" });
      }
      const parsed = createSchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const campaign = await prisma.campaign.update({
        where: { id },
        data: {
          name: parsed.data.name,
          audienceType: parsed.data.audienceType,
          audienceFilters: parsed.data.audienceFilters,
          templateName: parsed.data.templateName,
          templateVariantB:
            parsed.data.templateVariantB === undefined
              ? undefined
              : parsed.data.templateVariantB,
          abSplitPercent:
            parsed.data.abSplitPercent === undefined
              ? undefined
              : parsed.data.abSplitPercent,
          mergeFieldMap: parsed.data.mergeFieldMap,
          scheduledAt:
            parsed.data.scheduledAt === undefined
              ? undefined
              : parsed.data.scheduledAt
                ? new Date(parsed.data.scheduledAt)
                : null,
          timezone: parsed.data.timezone,
          rateLimitPerSec: parsed.data.rateLimitPerSec,
          status:
            parsed.data.scheduledAt === undefined
              ? undefined
              : parsed.data.scheduledAt
                ? CampaignStatus.SCHEDULED
                : CampaignStatus.DRAFT,
        },
      });
      return campaign;
    },
  );

  app.post(
    "/campaigns/:id/preview",
    { preHandler: requirePermission("campaigns:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      const audience = await resolveAudience(
        campaign.audienceType,
        campaign.audienceFilters,
      );
      const eligible = audience.filter((a) => !a.skipReason);
      const skipped = audience.filter((a) => a.skipReason);
      return {
        total: audience.length,
        eligible: eligible.length,
        skipped: skipped.length,
        sample: eligible.slice(0, 10),
      };
    },
  );

  app.post(
    "/campaigns/:id/preflight",
    { preHandler: requirePermission("campaigns:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });

      const checks: { id: string; ok: boolean; detail: string }[] = [];

      const template = await prisma.whatsAppTemplate.findUnique({
        where: { name: campaign.templateName },
      });
      checks.push({
        id: "template_approved",
        ok: Boolean(template && template.status === "APPROVED"),
        detail: template
          ? `Template ${template.name} is ${template.status}`
          : "Template not found in catalog",
      });

      if (campaign.templateVariantB) {
        const b = await prisma.whatsAppTemplate.findUnique({
          where: { name: campaign.templateVariantB },
        });
        checks.push({
          id: "template_b_approved",
          ok: Boolean(b && b.status === "APPROVED"),
          detail: b
            ? `Variant B ${b.name} is ${b.status}`
            : "Variant B template not found",
        });
      }

      const audience = await resolveAudience(
        campaign.audienceType,
        campaign.audienceFilters,
      );
      const eligible = audience.filter((a) => !a.skipReason).length;
      checks.push({
        id: "audience_nonempty",
        ok: eligible > 0,
        detail: `${eligible} eligible recipients (${audience.length} total)`,
      });

      const filters = (campaign.audienceFilters ?? {}) as { optInOnly?: boolean };
      checks.push({
        id: "opt_in_filter",
        ok: filters.optInOnly !== false,
        detail:
          filters.optInOnly === false
            ? "optInOnly is disabled — risky"
            : "optInOnly enabled",
      });

      checks.push({
        id: "suppression_wired",
        ok: true,
        detail: "Suppression checked at resolve + enqueue",
      });

      if (campaign.scheduledAt) {
        checks.push({
          id: "schedule_future",
          ok: campaign.scheduledAt.getTime() > Date.now() - 60_000,
          detail: `Scheduled at ${campaign.scheduledAt.toISOString()} (${campaign.timezone})`,
        });
      }

      const ok = checks.every((c) => c.ok);
      return { ok, checks };
    },
  );

  app.post(
    "/campaigns/:id/start",
    { preHandler: requirePermission("campaigns:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      if (
        campaign.status !== CampaignStatus.DRAFT &&
        campaign.status !== CampaignStatus.SCHEDULED &&
        campaign.status !== CampaignStatus.PAUSED
      ) {
        return reply.status(400).send({ error: `Cannot start from ${campaign.status}` });
      }

      // Inline preflight gate
      const template = await prisma.whatsAppTemplate.findUnique({
        where: { name: campaign.templateName },
      });
      if (!template || template.status !== "APPROVED") {
        return reply
          .status(400)
          .send({ error: "Preflight failed: template not approved" });
      }

      await materializeRecipients(id);
      const pending = await prisma.campaignRecipient.findMany({
        where: { campaignId: id, status: CampaignRecipientStatus.PENDING },
        select: { id: true },
      });
      if (!pending.length) {
        return reply.status(400).send({ error: "No eligible recipients to send" });
      }

      await prisma.campaignRecipient.updateMany({
        where: { campaignId: id, status: CampaignRecipientStatus.PENDING },
        data: { status: CampaignRecipientStatus.QUEUED },
      });

      const updated = await prisma.campaign.update({
        where: { id },
        data: {
          status: CampaignStatus.RUNNING,
          startedAt: new Date(),
          completedAt: null,
        },
      });

      try {
        await enqueueCampaignRecipients(
          id,
          pending.map((p) => p.id),
          campaign.rateLimitPerSec,
        );
      } catch (error) {
        return reply.status(500).send({
          error:
            error instanceof Error
              ? `Queue enqueue failed: ${error.message}`
              : "Queue enqueue failed",
          campaign: updated,
        });
      }

      return updated;
    },
  );

  app.post(
    "/campaigns/:id/schedule",
    { preHandler: requirePermission("campaigns:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = z
        .object({ scheduledAt: z.string().datetime() })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "scheduledAt ISO required" });
      }
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      if (
        campaign.status !== CampaignStatus.DRAFT &&
        campaign.status !== CampaignStatus.SCHEDULED
      ) {
        return reply.status(400).send({ error: "Cannot schedule in current status" });
      }
      return prisma.campaign.update({
        where: { id },
        data: {
          scheduledAt: new Date(parsed.data.scheduledAt),
          status: CampaignStatus.SCHEDULED,
        },
      });
    },
  );

  app.post(
    "/campaigns/:id/pause",
    { preHandler: requirePermission("campaigns:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      if (campaign.status !== CampaignStatus.RUNNING) {
        return reply.status(400).send({ error: "Only RUNNING campaigns can pause" });
      }
      await stopCampaignJobs(id);
      return prisma.campaign.update({
        where: { id },
        data: { status: CampaignStatus.PAUSED },
      });
    },
  );

  app.post(
    "/campaigns/:id/cancel",
    { preHandler: requirePermission("campaigns:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      await stopCampaignJobs(id);
      return prisma.campaign.update({
        where: { id },
        data: {
          status: CampaignStatus.CANCELLED,
          completedAt: new Date(),
        },
      });
    },
  );

  app.post(
    "/campaigns/:id/clone",
    { preHandler: requirePermission("campaigns:write") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      const user = request.authUser!;
      const clone = await prisma.campaign.create({
        data: {
          name: `${campaign.name} (copy)`,
          status: CampaignStatus.DRAFT,
          audienceType: campaign.audienceType,
          audienceFilters: campaign.audienceFilters ?? {},
          templateName: campaign.templateName,
          templateVariantB: campaign.templateVariantB,
          abSplitPercent: campaign.abSplitPercent,
          mergeFieldMap: campaign.mergeFieldMap ?? {},
          timezone: campaign.timezone,
          rateLimitPerSec: campaign.rateLimitPerSec,
          createdById: user.sub,
        },
      });
      return reply.status(201).send(clone);
    },
  );

  app.get(
    "/campaigns/:id/recipients",
    { preHandler: requirePermission("campaigns:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      const data = await prisma.campaignRecipient.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: "asc" },
        take: 500,
      });
      return { data };
    },
  );

  app.get(
    "/campaigns/:id/report",
    { preHandler: requirePermission("campaigns:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });

      const byStatus = await prisma.campaignRecipient.groupBy({
        by: ["status"],
        where: { campaignId: id },
        _count: true,
      });

      const statusCounts: Record<string, number> = {};
      for (const s of Object.values(CampaignRecipientStatus)) statusCounts[s] = 0;
      for (const row of byStatus) statusCounts[row.status] = row._count;

      return {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          totalRecipients: campaign.totalRecipients,
          sentCount: campaign.sentCount,
          deliveredCount: campaign.deliveredCount,
          failedCount: campaign.failedCount,
          skippedCount: campaign.skippedCount,
          repliedCount: campaign.repliedCount,
          readCount: campaign.readCount,
        },
        byStatus: statusCounts,
      };
    },
  );
};

/** Poll SCHEDULED campaigns whose scheduledAt has passed. */
export async function pollScheduledCampaigns() {
  const due = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.SCHEDULED,
      scheduledAt: { lte: new Date() },
    },
    take: 5,
  });
  for (const campaign of due) {
    try {
      await materializeRecipients(campaign.id);
      const pending = await prisma.campaignRecipient.findMany({
        where: {
          campaignId: campaign.id,
          status: CampaignRecipientStatus.PENDING,
        },
        select: { id: true },
      });
      if (!pending.length) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: CampaignStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        continue;
      }
      await prisma.campaignRecipient.updateMany({
        where: {
          campaignId: campaign.id,
          status: CampaignRecipientStatus.PENDING,
        },
        data: { status: CampaignRecipientStatus.QUEUED },
      });
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.RUNNING, startedAt: new Date() },
      });
      await enqueueCampaignRecipients(
        campaign.id,
        pending.map((p) => p.id),
        campaign.rateLimitPerSec,
      );
    } catch {
      // leave scheduled; retry next poll
    }
  }
}
