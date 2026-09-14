import { extractProspectFields, getListingDetail, searchListings } from "./tools.js";
import type { AgentProvider, AgentReply } from "./types.js";

export class MockAgent implements AgentProvider {
  readonly name = "mock";

  async reply(input: {
    phoneE164: string;
    userText: string;
    history?: import("./types.js").AgentMessage[];
  }): Promise<AgentReply> {
    const extracted = extractProspectFields(input.userText);

    if (extracted.wantsEscalate) {
      return {
        text: "I'll connect you with a broker who can help further. Someone from our team will follow up shortly.",
        escalate: true,
        escalationSummary: `Prospect asked for human help: "${input.userText.slice(0, 200)}"`,
        extracted,
      };
    }

    if (extracted.wantsViewing) {
      return {
        text: "Great — I've noted your interest in booking a viewing. A broker will confirm the time with you.",
        bookViewing: true,
        viewingNote: input.userText.slice(0, 240),
        extracted,
      };
    }

    const codeMatch = input.userText.match(/\b(LST-\d+)\b/i);
    if (codeMatch) {
      const detail = await getListingDetail(codeMatch[1]);
      if (!detail) {
        return {
          text: `I couldn't find an available listing matching ${codeMatch[1]}. Try another code or tell me a location and budget.`,
          extracted,
        };
      }
      return {
        text: `${detail.title} (${detail.listingCode}) in ${detail.location} — ${detail.currency} ${detail.price}. ${detail.description?.slice(0, 180) ?? ""}`.trim(),
        listings: [
          {
            listingCode: detail.listingCode,
            title: detail.title,
            location: detail.location,
            price: detail.price,
            currency: detail.currency,
          },
        ],
        extracted,
      };
    }

    const listings = await searchListings({
      location: extracted.preferredLocation,
      budgetMax: extracted.budgetMax,
      bedrooms: extracted.bedrooms,
      intent: extracted.intent,
    });

    if (!listings.length) {
      return {
        text: "I don't have matching available listings right now. Share a location, bedroom count, or budget and I'll check again.",
        extracted,
      };
    }

    const lines = listings.map(
      (l, i) =>
        `${i + 1}. ${l.title} (${l.listingCode}) — ${l.location}, ${l.currency} ${l.price}${l.bedrooms != null ? `, ${l.bedrooms}BR` : ""}`,
    );

    return {
      text: `Here are live matches from our inventory:\n${lines.join("\n")}\nReply with a listing code for details, or say "talk to broker" to escalate.`,
      listings: listings.map((l) => ({
        listingCode: l.listingCode,
        title: l.title,
        location: l.location,
        price: l.price,
        currency: l.currency,
      })),
      extracted,
    };
  }
}
