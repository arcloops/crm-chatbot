import type { FastifyPluginAsync } from "fastify";
import { AvailabilityStatus, LeadStage, MessageDirection } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { requirePermission } from "../plugins/auth.js";

function parseRange(query: Record<string, string | undefined>) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/analytics/overview",
    { preHandler: requirePermission("campaigns:read") },
    async (request) => {
      const { from, to } = parseRange(
        request.query as Record<string, string | undefined>,
      );

      const [
        campaignsRun,
        sentAgg,
        newProspects,
        conversions,
        messageOut,
        messageFailed,
      ] = await Promise.all([
        prisma.campaign.count({
          where: {
            OR: [
              { startedAt: { gte: from, lte: to } },
              { createdAt: { gte: from, lte: to } },
            ],
          },
        }),
        prisma.campaign.aggregate({
          where: {
            OR: [
              { startedAt: { gte: from, lte: to } },
              { createdAt: { gte: from, lte: to } },
            ],
          },
          _sum: {
            sentCount: true,
            deliveredCount: true,
            readCount: true,
            failedCount: true,
            repliedCount: true,
            skippedCount: true,
          },
        }),
        prisma.prospect.count({
          where: { createdAt: { gte: from, lte: to } },
        }),
        prisma.prospect.count({
          where: { convertedAt: { gte: from, lte: to } },
        }),
        prisma.message.count({
          where: {
            direction: MessageDirection.OUT,
            createdAt: { gte: from, lte: to },
          },
        }),
        prisma.message.count({
          where: {
            direction: MessageDirection.OUT,
            status: "FAILED",
            createdAt: { gte: from, lte: to },
          },
        }),
      ]);

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        campaignsRun,
        messagesSent: sentAgg._sum.sentCount ?? 0,
        messagesDelivered: sentAgg._sum.deliveredCount ?? 0,
        messagesRead: sentAgg._sum.readCount ?? 0,
        messagesFailed: sentAgg._sum.failedCount ?? 0,
        messagesReplied: sentAgg._sum.repliedCount ?? 0,
        messagesSkipped: sentAgg._sum.skippedCount ?? 0,
        outboundMessages: messageOut,
        outboundFailed: messageFailed,
        newProspects,
        conversions,
      };
    },
  );

  app.get(
    "/analytics/campaigns",
    { preHandler: requirePermission("campaigns:read") },
    async () => {
      const data = await prisma.campaign.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          audienceType: true,
          templateName: true,
          totalRecipients: true,
          sentCount: true,
          deliveredCount: true,
          readCount: true,
          failedCount: true,
          skippedCount: true,
          repliedCount: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      });
      return { data };
    },
  );

  app.get(
    "/analytics/funnel",
    { preHandler: requirePermission("contacts:read") },
    async () => {
      const [byStage, converted] = await Promise.all([
        prisma.prospect.groupBy({
          by: ["leadStage"],
          where: { convertedAt: null },
          _count: true,
        }),
        prisma.prospect.count({ where: { convertedAt: { not: null } } }),
      ]);

      const counts: Record<string, number> = {};
      for (const stage of Object.values(LeadStage)) counts[stage] = 0;
      for (const row of byStage) counts[row.leadStage] = row._count;

      const stages = [
        { stage: "NEW", count: counts.NEW },
        { stage: "QUALIFIED", count: counts.QUALIFIED },
        { stage: "VIEWING_BOOKED", count: counts.VIEWING_BOOKED },
        { stage: "COLD", count: counts.COLD },
        { stage: "CONVERTED", count: converted },
      ];

      const funnel = stages.map((row, index) => {
        const prior = index === 0 ? null : stages[index - 1].count;
        const shareOfPriorStagePercent =
          prior && prior > 0 ? Math.round((row.count / prior) * 1000) / 10 : null;
        return {
          ...row,
          /** Snapshot ratio (current stage count / prior stage count), not cohort conversion. */
          shareOfPriorStagePercent,
          conversionFromPrior: shareOfPriorStagePercent,
        };
      });

      return {
        funnel,
        totalOpen: Object.values(counts).reduce((a, b) => a + b, 0),
        metricNote:
          "shareOfPriorStagePercent is a point-in-time stage-count ratio, not true cohort conversion.",
      };
    },
  );

  app.get(
    "/analytics/inventory",
    { preHandler: requirePermission("listings:read") },
    async () => {
      const where = { archivedAt: null };
      const [byStatus, byCategory, byBroker] = await Promise.all([
        prisma.listing.groupBy({
          by: ["availabilityStatus"],
          where,
          _count: true,
        }),
        prisma.listing.groupBy({
          by: ["propertyCategory"],
          where,
          _count: true,
        }),
        prisma.listing.groupBy({
          by: ["brokerId"],
          where,
          _count: true,
        }),
      ]);

      const brokerIds = byBroker
        .map((r) => r.brokerId)
        .filter((id): id is string => Boolean(id));
      const brokers = brokerIds.length
        ? await prisma.broker.findMany({
            where: { id: { in: brokerIds } },
            select: { id: true, name: true, brokerCode: true },
          })
        : [];
      const brokerMap = new Map(brokers.map((b) => [b.id, b]));

      return {
        byStatus: byStatus.map((r) => ({
          status: r.availabilityStatus,
          count: r._count,
        })),
        byCategory: byCategory.map((r) => ({
          category: r.propertyCategory,
          count: r._count,
        })),
        byBroker: byBroker.map((r) => ({
          brokerId: r.brokerId,
          brokerName: r.brokerId
            ? (brokerMap.get(r.brokerId)?.name ?? "Unknown")
            : "Unassigned",
          brokerCode: r.brokerId ? (brokerMap.get(r.brokerId)?.brokerCode ?? null) : null,
          count: r._count,
        })),
      };
    },
  );

  app.get(
    "/analytics/attribution",
    { preHandler: requirePermission("contacts:read") },
    async (request) => {
      const { from, to } = parseRange(
        request.query as Record<string, string | undefined>,
      );
      const rows = await prisma.prospect.groupBy({
        by: ["leadSource"],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
      });

      const data = rows
        .map((r) => ({
          leadSource: r.leadSource ?? "unknown",
          count: r._count,
        }))
        .sort((a, b) => b.count - a.count);

      return { from: from.toISOString(), to: to.toISOString(), data };
    },
  );

  app.get(
    "/analytics/brokers/leaderboard",
    { preHandler: requirePermission("contacts:read") },
    async (request) => {
      const { from, to } = parseRange(
        request.query as Record<string, string | undefined>,
      );

      const brokers = await prisma.broker.findMany({
        where: { activeStatus: "ACTIVE" },
        select: {
          id: true,
          name: true,
          brokerCode: true,
          regionArea: true,
          _count: {
            select: {
              prospects: true,
              ownedListings: true,
            },
          },
        },
      });

      const conversions = await prisma.prospect.groupBy({
        by: ["assignedBrokerId"],
        where: {
          convertedAt: { gte: from, lte: to },
          assignedBrokerId: { not: null },
        },
        _count: true,
      });
      const convMap = new Map(conversions.map((c) => [c.assignedBrokerId!, c._count]));

      const openProspects = await prisma.prospect.groupBy({
        by: ["assignedBrokerId"],
        where: {
          convertedAt: null,
          assignedBrokerId: { not: null },
        },
        _count: true,
      });
      const openMap = new Map(openProspects.map((c) => [c.assignedBrokerId!, c._count]));

      const activeListings = await prisma.listing.groupBy({
        by: ["brokerId"],
        where: {
          archivedAt: null,
          brokerId: { not: null },
          availabilityStatus: {
            in: [
              AvailabilityStatus.AVAILABLE,
              AvailabilityStatus.RESERVED,
              AvailabilityStatus.UNDER_OFFER,
              AvailabilityStatus.COMING_SOON,
            ],
          },
        },
        _count: true,
      });
      const listingMap = new Map(activeListings.map((c) => [c.brokerId!, c._count]));

      const data = brokers
        .map((b) => ({
          id: b.id,
          name: b.name,
          brokerCode: b.brokerCode,
          regionArea: b.regionArea,
          openProspects: openMap.get(b.id) ?? 0,
          conversionsInRange: convMap.get(b.id) ?? 0,
          activeListings: listingMap.get(b.id) ?? 0,
        }))
        .sort(
          (a, b) =>
            b.conversionsInRange - a.conversionsInRange ||
            b.openProspects - a.openProspects,
        );

      return { from: from.toISOString(), to: to.toISOString(), data };
    },
  );

  app.get(
    "/analytics/inbox/metrics",
    { preHandler: requirePermission("inbox:read") },
    async (request) => {
      const { from, to } = parseRange(
        request.query as Record<string, string | undefined>,
      );

      const conversations = await prisma.conversation.findMany({
        where: {
          createdAt: { gte: from, lte: to },
        },
        select: {
          id: true,
          humanTakeover: true,
          escalatedAt: true,
          messages: {
            where: { direction: MessageDirection.OUT },
            orderBy: { createdAt: "asc" },
            take: 20,
            select: {
              createdAt: true,
              body: true,
            },
          },
        },
      });

      const total = conversations.length;
      const escalated = conversations.filter((c) => c.escalatedAt).length;
      const takeover = conversations.filter((c) => c.humanTakeover).length;
      const deflected = conversations.filter(
        (c) => !c.humanTakeover && !c.escalatedAt,
      ).length;

      const latencies: number[] = [];
      for (const c of conversations) {
        if (!c.escalatedAt) continue;
        const firstHuman = c.messages.find((m) => {
          if (m.createdAt < c.escalatedAt!) return false;
          const body = m.body ?? "";
          if (body.startsWith("Here are live matches")) return false;
          if (body.includes("I'll connect you")) return false;
          return true;
        });
        if (firstHuman) {
          latencies.push(firstHuman.createdAt.getTime() - c.escalatedAt.getTime());
        }
      }

      const avgResponseMs =
        latencies.length > 0
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : null;

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        totalConversations: total,
        escalated,
        takeover,
        deflected,
        deflectionRate: total > 0 ? Math.round((deflected / total) * 1000) / 10 : 0,
        deflectionNote:
          "Deflection = conversations created in range with no escalation and no human takeover.",
        avgEscalationResponseMs: avgResponseMs,
        avgEscalationResponseMinutes:
          avgResponseMs != null ? Math.round((avgResponseMs / 60000) * 10) / 10 : null,
        latencySampleSize: latencies.length,
      };
    },
  );
};
