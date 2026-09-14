import { extractProspectFields, getListingDetail, searchListings } from "./tools.js";
import {
  executeTool,
  mergeSideEffects,
  type ToolSideEffects,
} from "./toolExecutors.js";
import type { AgentProvider, AgentReply, AgentReplyInput } from "./types.js";

/**
 * Offline / no-API-key agent: uses the same tool executors as Claude when
 * heuristics match, so MOCK WhatsApp still exercises capture/handoff/viewing.
 */
export class MockAgent implements AgentProvider {
  readonly name = "mock";

  async reply(input: AgentReplyInput): Promise<AgentReply> {
    const extracted = extractProspectFields(input.userText);
    let sideEffects: ToolSideEffects = {
      extracted: {
        budgetMax: extracted.budgetMax,
        preferredLocation: extracted.preferredLocation,
        intent: extracted.intent,
        bedrooms: extracted.bedrooms,
      },
    };
    const toolCalls: NonNullable<AgentReply["toolCalls"]> = [];

    async function run(
      name: string,
      args: Record<string, unknown>,
    ): Promise<unknown> {
      toolCalls.push({ name, input: args });
      const { content, sideEffects: next } = await executeTool(name, args, {
        phoneE164: input.phoneE164,
        conversationId: input.conversationId,
        prospectId: input.prospectId,
        profileName: input.profileName,
        channel: input.channel,
      });
      sideEffects = mergeSideEffects(sideEffects, next);
      return content;
    }

    if (extracted.preferredLocation || extracted.budgetMax || extracted.intent) {
      await run("capture_lead", {
        phone: input.phoneE164,
        name: input.profileName,
        preferred_location: extracted.preferredLocation,
        budget: extracted.budgetMax != null ? String(extracted.budgetMax) : undefined,
        intent: extracted.intent?.toLowerCase(),
      });
    }

    if (extracted.wantsEscalate) {
      await run("handoff_to_human", {
        reason: `Prospect asked for human help: "${input.userText.slice(0, 200)}"`,
      });
      return {
        text: "I'll connect you with a broker who can help further. Someone from our team will follow up shortly.",
        escalate: true,
        escalationSummary: sideEffects.escalationSummary,
        extracted: sideEffects.extracted as AgentReply["extracted"],
        toolCalls,
      };
    }

    const codeMatch = input.userText.match(/\b(LST-\d+)\b/i);
    if (extracted.wantsViewing && codeMatch) {
      await run("schedule_viewing", { listing_id: codeMatch[1] });
      return {
        text: `I've noted a viewing request for ${codeMatch[1]}. A broker will confirm the time with you.`,
        bookViewing: true,
        viewingNote: sideEffects.viewingNote,
        listings: sideEffects.listings,
        extracted: sideEffects.extracted as AgentReply["extracted"],
        toolCalls,
      };
    }

    if (extracted.wantsViewing) {
      return {
        text: "Great — share a listing code (e.g. LST-00001) and a preferred date/time, and I'll book the viewing request.",
        bookViewing: true,
        viewingNote: input.userText.slice(0, 240),
        extracted,
        toolCalls,
      };
    }

    if (codeMatch) {
      await run("get_listing_detail", { listing_id: codeMatch[1] });
      const detail = await getListingDetail(codeMatch[1]);
      if (!detail) {
        return {
          text: `I couldn't find an available listing matching ${codeMatch[1]}. Try another code or tell me a location and budget.`,
          extracted,
          toolCalls,
        };
      }
      return {
        text: `${detail.title} (${detail.listingCode}) in ${detail.location} — ${detail.currency} ${detail.price}. ${detail.description?.slice(0, 180) ?? ""}`.trim(),
        listings: sideEffects.listings,
        extracted,
        toolCalls,
      };
    }

    await run("search_listings", {
      location: extracted.preferredLocation,
      max_price: extracted.budgetMax,
      bedrooms: extracted.bedrooms,
      intent: extracted.intent?.toLowerCase(),
    });

    const listings = sideEffects.listings ?? [];
    if (!listings.length) {
      // Double-check via direct search for empty-results messaging
      const empty = await searchListings({
        location: extracted.preferredLocation,
        budgetMax: extracted.budgetMax,
        bedrooms: extracted.bedrooms,
        intent: extracted.intent,
      });
      if (!empty.length) {
        return {
          text: "I don't have matching available listings right now. Would you like to widen the area or adjust the budget?",
          extracted,
          toolCalls,
        };
      }
    }

    const lines = (listings.length
      ? listings
      : await searchListings({
          location: extracted.preferredLocation,
          budgetMax: extracted.budgetMax,
          bedrooms: extracted.bedrooms,
          intent: extracted.intent,
        })
    ).map(
      (l, i) =>
        `${i + 1}. ${l.title} (${l.listingCode}) — ${l.location}, ${l.currency} ${l.price}`,
    );

    return {
      text: `Here are live matches from our inventory:\n${lines.join("\n")}\nReply with a listing code for details, or say "talk to broker" to escalate.`,
      listings: sideEffects.listings,
      extracted: sideEffects.extracted as AgentReply["extracted"],
      toolCalls,
    };
  }
}
