import type { FastifyPluginAsync } from "fastify";
import {
  ActiveStatus,
  AvailabilityStatus,
  CampaignStatus,
  LeadStage,
} from "@prisma/client";
import { prisma } from "../lib/db.js";
import { authenticate } from "../plugins/auth.js";

export const statsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/stats", { preHandler: authenticate }, async () => {
    const [
      listingsByStatus,
      prospectsByStage,
      staffActive,
      brokersActive,
      customersCount,
      suppressionCount,
      campaignsTotal,
      campaignsByStatusRows,
    ] = await Promise.all([
      prisma.listing.groupBy({
        by: ["availabilityStatus"],
        where: { archivedAt: null },
        _count: true,
      }),
      prisma.prospect.groupBy({
        by: ["leadStage"],
        _count: true,
      }),
      prisma.staffUser.count({ where: { activeStatus: ActiveStatus.ACTIVE } }),
      prisma.broker.count({ where: { activeStatus: ActiveStatus.ACTIVE } }),
      prisma.customer.count(),
      prisma.suppressionEntry.count(),
      prisma.campaign.count(),
      prisma.campaign.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    const listingStatus: Record<string, number> = {};
    for (const status of Object.values(AvailabilityStatus)) {
      listingStatus[status] = 0;
    }
    for (const row of listingsByStatus) {
      listingStatus[row.availabilityStatus] = row._count;
    }

    const prospectStage: Record<string, number> = {};
    for (const stage of Object.values(LeadStage)) {
      prospectStage[stage] = 0;
    }
    for (const row of prospectsByStage) {
      prospectStage[row.leadStage] = row._count;
    }

    const campaignsByStatus: Record<string, number> = {};
    for (const status of Object.values(CampaignStatus)) {
      campaignsByStatus[status] = 0;
    }
    for (const row of campaignsByStatusRows) {
      campaignsByStatus[row.status] = row._count;
    }

    return {
      listingsByStatus: listingStatus,
      prospectsByStage: prospectStage,
      staffActive,
      brokersActive,
      customersCount,
      suppressionCount,
      campaignsTotal,
      campaignsByStatus,
    };
  });
};
