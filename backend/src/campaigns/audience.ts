import {
  CampaignAudienceType,
  CampaignContactType,
  LeadStage,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../lib/db.js";
import { isPhoneSuppressed } from "../lib/suppression.js";

export type AudienceFilters = {
  tags?: string[];
  stages?: string[];
  regions?: string[];
  optInOnly?: boolean;
  listingId?: string | null;
  developerId?: string | null;
};

export type ResolvedRecipient = {
  phoneE164: string;
  contactType: CampaignContactType;
  contactId: string;
  mergePayload: Record<string, string>;
  skipReason?: string;
};

function asFilters(raw: unknown): AudienceFilters {
  if (!raw || typeof raw !== "object") return { optInOnly: true };
  return { optInOnly: true, ...(raw as AudienceFilters) };
}

export async function resolveAudience(
  audienceType: CampaignAudienceType,
  filtersRaw: unknown,
): Promise<ResolvedRecipient[]> {
  const filters = asFilters(filtersRaw);
  const optInOnly = filters.optInOnly !== false;
  const results: ResolvedRecipient[] = [];

  if (audienceType === CampaignAudienceType.BROKERS) {
    const where: Prisma.BrokerWhereInput = {};
    if (optInOnly) where.optInStatus = true;
    if (filters.regions?.length) where.regionArea = { in: filters.regions };
    if (filters.tags?.length) where.tags = { hasSome: filters.tags };

    const rows = await prisma.broker.findMany({
      where,
      include: {
        ownedListings: {
          where: { archivedAt: null },
          take: 1,
          orderBy: { lastUpdated: "desc" },
        },
      },
    });

    for (const row of rows) {
      const listing = row.ownedListings[0];
      results.push({
        phoneE164: row.phoneE164,
        contactType: CampaignContactType.BROKER,
        contactId: row.id,
        mergePayload: {
          name: row.name,
          listingTitle: listing?.title ?? "",
          price: listing ? String(listing.price) : "",
          location: listing?.location ?? row.regionArea ?? "",
          brokerName: row.name,
          ctaUrl: "https://arcloops.local/listings",
        },
      });
    }
  }

  if (audienceType === CampaignAudienceType.CUSTOMERS) {
    const where: Prisma.CustomerWhereInput = {};
    if (optInOnly) where.optInStatus = true;
    if (filters.tags?.length) where.tags = { hasSome: filters.tags };
    if (filters.listingId) where.listingId = filters.listingId;

    const rows = await prisma.customer.findMany({
      where,
      include: {
        listing: true,
        assignedBroker: { select: { name: true } },
      },
    });

    for (const row of rows) {
      results.push({
        phoneE164: row.phoneE164,
        contactType: CampaignContactType.CUSTOMER,
        contactId: row.id,
        mergePayload: {
          name: row.name,
          listingTitle: row.listing?.title ?? "",
          price: row.listing ? String(row.listing.price) : "",
          location: row.listing?.location ?? "",
          brokerName: row.assignedBroker?.name ?? "",
          ctaUrl: "https://arcloops.local/refer",
        },
      });
    }
  }

  if (audienceType === CampaignAudienceType.PROSPECTS) {
    const where: Prisma.ProspectWhereInput = { convertedAt: null };
    if (optInOnly) where.optInStatus = true;
    if (filters.tags?.length) where.tags = { hasSome: filters.tags };
    if (filters.developerId) {
      where.referredByDeveloperId = filters.developerId;
    }
    if (filters.stages?.length) {
      where.leadStage = {
        in: filters.stages.filter((s): s is LeadStage =>
          Object.values(LeadStage).includes(s as LeadStage),
        ),
      };
    }

    const rows = await prisma.prospect.findMany({
      where,
      include: { assignedBroker: { select: { name: true } } },
    });

    for (const row of rows) {
      results.push({
        phoneE164: row.phoneE164,
        contactType: CampaignContactType.PROSPECT,
        contactId: row.id,
        mergePayload: {
          name: row.name,
          listingTitle: "",
          price: row.budgetMax ? String(row.budgetMax) : "",
          location: row.preferredLocation ?? "",
          brokerName: row.assignedBroker?.name ?? "",
          ctaUrl: "https://arcloops.local/listings",
        },
      });
    }
  }

  if (audienceType === CampaignAudienceType.DEVELOPERS) {
    const where: Prisma.DeveloperWhereInput = {};
    if (optInOnly) where.optInStatus = true;
    if (filters.regions?.length) where.region = { in: filters.regions };
    if (filters.tags?.length) where.tags = { hasSome: filters.tags };
    if (filters.developerId) where.id = filters.developerId;

    const rows = await prisma.developer.findMany({ where });
    for (const row of rows) {
      results.push({
        phoneE164: row.phoneE164,
        contactType: CampaignContactType.DEVELOPER,
        contactId: row.id,
        mergePayload: {
          name: row.name,
          listingTitle: row.companyName ?? "",
          price: "",
          location: row.region ?? "",
          brokerName: row.name,
          ctaUrl: "https://arcloops.local/developers",
        },
      });
    }
  }

  // Apply suppression hard-skip markers
  const out: ResolvedRecipient[] = [];
  for (const r of results) {
    if (await isPhoneSuppressed(r.phoneE164)) {
      out.push({ ...r, skipReason: "suppressed" });
    } else {
      out.push(r);
    }
  }
  return out;
}
