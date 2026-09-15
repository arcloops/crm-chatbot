import { LeadStage, ProspectIntent } from "@prisma/client";
import { getLogger } from "../lib/logger.js";
import { prisma } from "../lib/db.js";
import { escalateConversation, upsertProspectFromPhone } from "./escalate.js";
import { getListingDetail, searchListings } from "./tools.js";

export type ToolContext = {
  phoneE164: string;
  conversationId?: string;
  prospectId?: string;
  profileName?: string;
  channel?: "whatsapp" | "dashboard";
};

export type ToolCallLog = {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
};

function parseBudgetNumber(raw?: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().toLowerCase().replace(/,/g, "");
  const match = cleaned.match(/([\d.]+)\s*(cr|crore|lakh|lac)?/);
  if (!match) return undefined;
  let n = Number(match[1]);
  if (!Number.isFinite(n)) return undefined;
  const unit = match[2];
  if (unit === "cr" || unit === "crore") n *= 10_000_000;
  if (unit === "lakh" || unit === "lac") n *= 100_000;
  return n;
}

function mapIntent(raw?: string): ProspectIntent | undefined {
  if (!raw) return undefined;
  const key = raw.toLowerCase();
  if (key === "buy" || key === "purchase") return ProspectIntent.BUY;
  if (key === "rent") return ProspectIntent.RENT;
  if (key === "invest" || key === "investment") return ProspectIntent.INVEST;
  return undefined;
}

export async function executeTool(
  name: string,
  rawInput: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ content: unknown; sideEffects: Partial<ToolSideEffects> }> {
  const log = getLogger({ route: "agent/tool", tool: name });
  log.info({ input: rawInput, phoneE164: ctx.phoneE164 }, "tool_call");

  switch (name) {
    case "search_listings": {
      const location =
        typeof rawInput.location === "string" ? rawInput.location.trim() : undefined;
      const propertyType =
        typeof rawInput.property_type === "string" ? rawInput.property_type : undefined;
      const minPrice = typeof rawInput.min_price === "number" ? rawInput.min_price : undefined;
      const maxPrice = typeof rawInput.max_price === "number" ? rawInput.max_price : undefined;
      const bedrooms = typeof rawInput.bedrooms === "number" ? rawInput.bedrooms : undefined;
      const intent =
        typeof rawInput.intent === "string"
          ? (rawInput.intent as "buy" | "rent" | "invest")
          : undefined;

      const hasFilter = Boolean(
        (location && location.length > 0) ||
          propertyType ||
          minPrice != null ||
          maxPrice != null ||
          bedrooms != null ||
          intent,
      );

      if (!hasFilter) {
        return {
          content: {
            count: 0,
            listings: [],
            error:
              "No search filters provided. Ask the user for location, budget, bedrooms, property type, or buy/rent/invest before searching. Do not invent listings.",
          },
          sideEffects: {},
        };
      }

      const listings = await searchListings({
        location,
        propertyType,
        minPrice,
        maxPrice,
        bedrooms,
        intent,
      });
      return {
        content: { count: listings.length, listings },
        sideEffects: {
          listings: listings.map((l) => ({
            listingCode: l.listingCode,
            title: l.title,
            location: l.location,
            price: l.price,
            currency: l.currency,
          })),
          extracted: {
            preferredLocation: location,
            budgetMax: maxPrice,
            budgetMin: minPrice,
            intent: typeof rawInput.intent === "string" ? rawInput.intent : undefined,
            bedrooms,
          },
        },
      };
    }

    case "get_listing_detail": {
      const id =
        typeof rawInput.listing_id === "string"
          ? rawInput.listing_id
          : typeof rawInput.listingId === "string"
            ? rawInput.listingId
            : "";
      const detail = id ? await getListingDetail(id) : null;
      return {
        content: detail ?? { error: "Listing not found or not available" },
        sideEffects: detail
          ? {
              listings: [
                {
                  listingCode: detail.listingCode,
                  title: detail.title,
                  location: detail.location,
                  price: detail.price,
                  currency: detail.currency,
                },
              ],
            }
          : {},
      };
    }

    case "capture_lead": {
      const phone =
        typeof rawInput.phone === "string" && rawInput.phone.trim()
          ? rawInput.phone.trim()
          : ctx.phoneE164;
      const name =
        (typeof rawInput.name === "string" && rawInput.name.trim()) ||
        ctx.profileName ||
        undefined;
      const preferredLocation =
        typeof rawInput.preferred_location === "string"
          ? rawInput.preferred_location
          : undefined;
      const intent = mapIntent(
        typeof rawInput.intent === "string" ? rawInput.intent : undefined,
      );
      const budgetMax = parseBudgetNumber(
        typeof rawInput.budget === "string" ? rawInput.budget : undefined,
      );
      const notes = typeof rawInput.notes === "string" ? rawInput.notes : undefined;

      const prospect = await upsertProspectFromPhone(phone, phone, {
        preferredLocation,
        budgetMax,
        intent,
        leadSource: "whatsapp_bot",
        name,
        notes,
      });

      return {
        content: {
          ok: true,
          prospectId: prospect.id,
          prospectCode: prospect.prospectCode,
          name: prospect.name,
        },
        sideEffects: {
          prospectId: prospect.id,
          extracted: {
            preferredLocation: preferredLocation ?? undefined,
            budgetMax,
            intent,
          },
        },
      };
    }

    case "handoff_to_human": {
      const reason =
        typeof rawInput.reason === "string" && rawInput.reason.trim()
          ? rawInput.reason.trim()
          : "Prospect requested human assistance";

      if (ctx.conversationId) {
        const result = await escalateConversation({
          conversationId: ctx.conversationId,
          prospectId: ctx.prospectId,
          summary: reason.slice(0, 500),
          preferredRegion: undefined,
        });
        getLogger({ route: "agent/handoff" }).info(
          {
            conversationId: ctx.conversationId,
            brokerId: result.broker?.id,
            brokerName: result.broker?.name,
            reason,
          },
          "Broker handoff notification (stub)",
        );
      }

      return {
        content: { ok: true, escalated: true, reason },
        sideEffects: {
          escalate: true,
          escalationSummary: reason.slice(0, 500),
        },
      };
    }

    case "schedule_viewing": {
      const listingRef =
        typeof rawInput.listing_id === "string" ? rawInput.listing_id : "";
      const preferredDate =
        typeof rawInput.preferred_date === "string" ? rawInput.preferred_date : null;
      const preferredTime =
        typeof rawInput.preferred_time === "string" ? rawInput.preferred_time : null;

      const listing = listingRef ? await getListingDetail(listingRef) : null;
      if (!listing) {
        return {
          content: { ok: false, error: "Listing not found" },
          sideEffects: {},
        };
      }

      let prospectId = ctx.prospectId;
      if (!prospectId) {
        const p = await upsertProspectFromPhone(ctx.phoneE164, ctx.phoneE164, {
          name: ctx.profileName,
        });
        prospectId = p.id;
      }

      const viewing = await prisma.viewingRequest.create({
        data: {
          prospectId,
          listingId: listing.id,
          preferredDate,
          preferredTime,
          notes: `Requested via ${ctx.channel ?? "whatsapp"} bot`,
        },
      });

      await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          leadStage: LeadStage.VIEWING_BOOKED,
          viewingAt: new Date(),
          viewingNote: [
            listing.listingCode,
            preferredDate,
            preferredTime,
          ]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 240),
          lastInteractionDate: new Date(),
        },
      });

      return {
        content: {
          ok: true,
          viewingRequestId: viewing.id,
          listingCode: listing.listingCode,
          preferredDate,
          preferredTime,
        },
        sideEffects: {
          bookViewing: true,
          viewingNote: `${listing.listingCode}${preferredDate ? ` on ${preferredDate}` : ""}${preferredTime ? ` at ${preferredTime}` : ""}`,
          listings: [
            {
              listingCode: listing.listingCode,
              title: listing.title,
              location: listing.location,
              price: listing.price,
              currency: listing.currency,
            },
          ],
        },
      };
    }

    default:
      return {
        content: { error: `Unknown tool: ${name}` },
        sideEffects: {},
      };
  }
}

export type ToolSideEffects = {
  escalate?: boolean;
  escalationSummary?: string;
  bookViewing?: boolean;
  viewingNote?: string;
  prospectId?: string;
  listings?: Array<{
    listingCode: string;
    title: string;
    location: string;
    price: string;
    currency: string;
  }>;
  extracted?: {
    budgetMax?: number;
    budgetMin?: number;
    preferredLocation?: string;
    intent?: string | ProspectIntent;
    bedrooms?: number;
  };
};

export function mergeSideEffects(
  into: ToolSideEffects,
  next: Partial<ToolSideEffects>,
): ToolSideEffects {
  return {
    escalate: into.escalate || next.escalate,
    escalationSummary: next.escalationSummary ?? into.escalationSummary,
    bookViewing: into.bookViewing || next.bookViewing,
    viewingNote: next.viewingNote ?? into.viewingNote,
    prospectId: next.prospectId ?? into.prospectId,
    listings: [...(into.listings ?? []), ...(next.listings ?? [])].filter(
      (l, i, arr) => arr.findIndex((x) => x.listingCode === l.listingCode) === i,
    ),
    extracted: {
      ...into.extracted,
      ...Object.fromEntries(
        Object.entries(next.extracted ?? {}).filter(([, v]) => v !== undefined),
      ),
    },
  };
}
