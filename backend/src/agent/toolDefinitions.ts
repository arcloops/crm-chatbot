/** Anthropic tool schemas for the property assistant (guide Module 2). */

export const AGENT_TOOLS = [
  {
    name: "search_listings",
    description:
      "Search the live property portfolio by structured filters. Use this whenever the prospect asks about available properties. Never invent listings — only report what this tool returns.",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Area/neighbourhood, e.g. Gulshan, Banani, Dhanmondi",
        },
        property_type: {
          type: "string",
          enum: ["apartment", "house", "land", "commercial"],
        },
        min_price: { type: "number" },
        max_price: { type: "number" },
        bedrooms: { type: "number" },
        intent: { type: "string", enum: ["buy", "rent", "invest"] },
      },
    },
  },
  {
    name: "get_listing_detail",
    description:
      "Fetch full details for one listing by listing code (e.g. LST-00001) or id when the prospect asks about a specific property.",
    input_schema: {
      type: "object",
      properties: {
        listing_id: {
          type: "string",
          description: "Listing code or database id",
        },
      },
      required: ["listing_id"],
    },
  },
  {
    name: "capture_lead",
    description:
      "Save the prospect's contact and qualification details as soon as you know them. Call this as soon as you have a phone number plus at least one qualifying field (budget, location, or intent) — do not wait to collect everything first.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        budget: { type: "string" },
        preferred_location: { type: "string" },
        intent: { type: "string", enum: ["buy", "rent", "invest"] },
        notes: { type: "string" },
      },
      required: ["phone"],
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Escalate to a human broker. Use for price negotiation, legal/contract questions, document collection, or whenever the prospect explicitly asks for a person. These are out of scope for you to handle — always escalate rather than attempting them.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
  {
    name: "schedule_viewing",
    description: "Offer or book a property viewing once a specific listing is of interest.",
    input_schema: {
      type: "object",
      properties: {
        listing_id: { type: "string" },
        preferred_date: { type: "string" },
        preferred_time: { type: "string" },
      },
      required: ["listing_id"],
    },
  },
] as const;

export const WHATSAPP_SYSTEM_PROMPT = `You are the WhatsApp property assistant for arXcrm's real estate portfolio.

Rules:
- Reply in whichever language the prospect uses — Bengali, English, or mixed. Mirror them, don't force one language.
- Keep replies short. This is a WhatsApp chat, not an email.
- Never invent or guess listing details. Only state what search_listings or get_listing_detail actually returns.
- Never negotiate price, discuss legal/contract terms, or collect documents. Call handoff_to_human for these instead of attempting them.
- Call capture_lead as soon as you have a phone number and at least one qualifying detail — don't wait until the end of the conversation.
- If search_listings returns nothing matching, say so plainly and ask if they'd like to adjust their criteria (wider area, different budget) — don't make something up to fill the gap.
- If the prospect asks for a human at any point, call handoff_to_human immediately.
- Use schedule_viewing when they want to visit a specific listing.
`;

export const DASHBOARD_SYSTEM_PROMPT = `You are the arXcrm property assistant for logged-in CRM staff.

Rules:
- Be concise and practical.
- Never invent listing details — only use search_listings / get_listing_detail results.
- Help staff find inventory, qualify leads conceptually, and suggest next steps.
- For negotiation, legal, or document collection questions, recommend human handoff via handoff_to_human when a prospect phone/context is available.
`;
