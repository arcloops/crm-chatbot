import {
  AvailabilityStatus,
  LeadStage,
  ProspectIntent,
  PropertyCategory,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../lib/db.js";

export type ListingSearchInput = {
  location?: string;
  budgetMax?: number;
  bedrooms?: number;
  propertyCategory?: PropertyCategory;
  intent?: ProspectIntent;
};

export async function searchListings(input: ListingSearchInput) {
  const where: Prisma.ListingWhereInput = {
    archivedAt: null,
    availabilityStatus: {
      in: [AvailabilityStatus.AVAILABLE, AvailabilityStatus.COMING_SOON],
    },
  };
  if (input.location) {
    where.location = { contains: input.location, mode: "insensitive" };
  }
  if (input.budgetMax != null) {
    where.price = { lte: input.budgetMax };
  }
  if (input.bedrooms != null) {
    where.bedrooms = { gte: input.bedrooms };
  }
  if (input.propertyCategory) {
    where.propertyCategory = input.propertyCategory;
  }

  const data = await prisma.listing.findMany({
    where,
    orderBy: { lastUpdated: "desc" },
    take: 5,
    select: {
      id: true,
      listingCode: true,
      title: true,
      location: true,
      price: true,
      currency: true,
      bedrooms: true,
      bathrooms: true,
      propertyCategory: true,
      availabilityStatus: true,
      photos: true,
    },
  });

  return data.map((l) => ({
    ...l,
    price: l.price.toString(),
  }));
}

export async function getListingDetail(idOrCode: string) {
  const listing = await prisma.listing.findFirst({
    where: {
      OR: [{ id: idOrCode }, { listingCode: idOrCode }],
      archivedAt: null,
      availabilityStatus: {
        in: [AvailabilityStatus.AVAILABLE, AvailabilityStatus.COMING_SOON],
      },
    },
    include: { broker: { select: { id: true, name: true, phoneE164: true } } },
  });
  if (!listing) return null;
  return { ...listing, price: listing.price.toString() };
}

export function extractProspectFields(text: string): {
  budgetMax?: number;
  preferredLocation?: string;
  intent?: ProspectIntent;
  bedrooms?: number;
  wantsViewing?: boolean;
  wantsEscalate?: boolean;
} {
  const lower = text.toLowerCase();
  const out: {
    budgetMax?: number;
    preferredLocation?: string;
    intent?: ProspectIntent;
    bedrooms?: number;
    wantsViewing?: boolean;
    wantsEscalate?: boolean;
  } = {};

  const bedMatch = lower.match(/(\d+)\s*(?:br|bed|bedroom)/);
  if (bedMatch) out.bedrooms = Number(bedMatch[1]);

  const budgetMatch = lower.match(
    /(?:under|below|max|budget)\s*([\d,.]+)\s*(cr|crore|lakh|lac)?/i,
  );
  if (budgetMatch) {
    let n = Number(budgetMatch[1].replace(/,/g, ""));
    const unit = budgetMatch[2]?.toLowerCase();
    if (unit === "cr" || unit === "crore") n *= 10_000_000;
    if (unit === "lakh" || unit === "lac") n *= 100_000;
    out.budgetMax = n;
  }

  const areas = [
    "banani",
    "gulshan",
    "dhanmondi",
    "uttara",
    "mirpur",
    "bashundhara",
    "motijheel",
  ];
  for (const area of areas) {
    if (lower.includes(area)) {
      out.preferredLocation = area.charAt(0).toUpperCase() + area.slice(1);
      break;
    }
  }

  if (/\brent\b/.test(lower)) out.intent = ProspectIntent.RENT;
  else if (/\binvest\b/.test(lower)) out.intent = ProspectIntent.INVEST;
  else if (/\bbuy\b|\bpurchase\b/.test(lower)) out.intent = ProspectIntent.BUY;

  if (/viewing|visit|tour|book a visit|schedule/.test(lower)) {
    out.wantsViewing = true;
  }

  if (/human|agent|broker|talk to|speak to|escalate|help me|representative/.test(lower)) {
    out.wantsEscalate = true;
  }

  return out;
}

export { LeadStage };
