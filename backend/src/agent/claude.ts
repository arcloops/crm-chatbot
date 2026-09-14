import { env } from "../lib/env.js";
import { MockAgent } from "./mock.js";
import { extractProspectFields, searchListings } from "./tools.js";
import type { AgentMessage, AgentProvider, AgentReply } from "./types.js";

export class ClaudeAgent implements AgentProvider {
  readonly name = "claude";

  async reply(input: {
    phoneE164: string;
    userText: string;
    history?: AgentMessage[];
    channel?: "whatsapp" | "dashboard";
    staffName?: string;
  }): Promise<AgentReply> {
    const apiKey = env().ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new MockAgent().reply(input);
    }

    try {
      const extracted = extractProspectFields(input.userText);
      const listings = await searchListings({
        location: extracted.preferredLocation,
        budgetMax: extracted.budgetMax,
        bedrooms: extracted.bedrooms,
        intent: extracted.intent,
      });

      const prior = (input.history ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const isDashboard = input.channel === "dashboard";
      const staff = input.staffName?.trim() || "staff";
      const userContent = isDashboard
        ? `Staff user (${staff}) asks: ${input.userText}\n\nInventory:\n${JSON.stringify(listings)}\n\nRespond helpfully for CRM staff.`
        : `Prospect message: ${input.userText}\n\nInventory:\n${JSON.stringify(listings)}\n\nRespond with a helpful WhatsApp message.`;
      const system = isDashboard
        ? "You are the arXcrm property assistant for logged-in CRM staff. Only recommend listings from the provided inventory JSON. Never invent prices or addresses. Be concise and practical."
        : "You are arXcrm property assistant. Only recommend listings from the provided inventory JSON. Never invent prices or addresses. If unsure, say so. Keep replies concise for WhatsApp.";

      const messages = [
        ...prior,
        {
          role: "user" as const,
          content: userContent,
        },
      ];

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 512,
          system,
          messages,
        }),
      });

      if (!res.ok) {
        return new MockAgent().reply(input);
      }

      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text =
        data.content?.find((c) => c.type === "text")?.text ??
        (await new MockAgent().reply(input)).text;

      return {
        text,
        escalate: extracted.wantsEscalate,
        bookViewing: extracted.wantsViewing,
        viewingNote: extracted.wantsViewing ? input.userText.slice(0, 240) : undefined,
        escalationSummary: extracted.wantsEscalate
          ? `Claude escalate: ${input.userText.slice(0, 200)}`
          : undefined,
        extracted,
        listings: listings.map((l) => ({
          listingCode: l.listingCode,
          title: l.title,
          location: l.location,
          price: l.price,
          currency: l.currency,
        })),
      };
    } catch {
      return new MockAgent().reply(input);
    }
  }
}
