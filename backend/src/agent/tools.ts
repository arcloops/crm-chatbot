import {
  AvailabilityStatus,
  LeadStage,
  ProspectIntent,
  PropertyCategory,
  TransactionType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "../lib/db.js";

export type ListingSearchInput = {
  location?: string;
  budgetMin?: number;
  budgetMax?: number;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  propertyCategory?: PropertyCategory;
  propertyType?: string;
  intent?: ProspectIntent | "buy" | "rent" | "invest";
};

const PROPERTY_TYPE_MAP: Record<string, PropertyCategory> = {
  apartment: PropertyCategory.APARTMENT,
  flat: PropertyCategory.APARTMENT,
  house: PropertyCategory.HOUSE,
  land: PropertyCategory.LAND,
  commercial: PropertyCategory.COMMERCIAL,
  pre_launch: PropertyCategory.PRE_LAUNCH,
  "pre-launch": PropertyCategory.PRE_LAUNCH,
  mixed_use: PropertyCategory.MIXED_USE,
  "mixed-use": PropertyCategory.MIXED_USE,
};

function mapIntentToTransaction(
  intent?: ListingSearchInput["intent"],
): TransactionType | undefined {
  if (!intent) return undefined;
  const key = String(intent).toLowerCase();
  if (key === "buy" || key === "purchase") return TransactionType.SALE;
  if (key === "rent") return TransactionType.RENT;
  if (key === "invest" || key === "investment") return TransactionType.INVESTMENT;
  if (key === "lease") return TransactionType.LEASE;
  return undefined;
}

export function mapPropertyType(raw?: string): PropertyCategory | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (PROPERTY_TYPE_MAP[key]) return PROPERTY_TYPE_MAP[key];
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_") as PropertyCategory;
  return Object.values(PropertyCategory).includes(upper) ? upper : undefined;
}

export async function searchListings(input: ListingSearchInput) {
  const where: Prisma.ListingWhereInput = {
    archivedAt: null,
    availabilityStatus: {
      in: [AvailabilityStatus.AVAILABLE, AvailabilityStatus.COMING_SOON],
    },
  };

  if (input.location) {
    where.location = { contains: input.location.trim(), mode: "insensitive" };
  }

  const minPrice = input.minPrice ?? input.budgetMin;
  const maxPrice = input.maxPrice ?? input.budgetMax;
  if (minPrice != null || maxPrice != null) {
    where.price = {
      ...(minPrice != null ? { gte: minPrice } : {}),
      ...(maxPrice != null ? { lte: maxPrice } : {}),
    };
  }

  if (input.bedrooms != null) {
    where.bedrooms = { gte: input.bedrooms };
  }

  const category = input.propertyCategory ?? mapPropertyType(input.propertyType);
  if (category) {
    where.propertyCategory = category;
  }

  const transactionType = mapIntentToTransaction(input.intent);
  if (transactionType) {
    where.transactionType = transactionType;
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
      transactionType: true,
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

export async function listActiveLocationAreas() {
  return prisma.locationArea.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
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

  if (
    /human|agent|broker|talk to|speak to|escalate|help me|representative|lawyer|legal|contract|negotiate|document/.test(
      lower,
    )
  ) {
    out.wantsEscalate = true;
  }

  return out;
}

export { LeadStage };
