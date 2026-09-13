export type AgentMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AgentReply = {
  text: string;
  escalate?: boolean;
  escalationSummary?: string;
  bookViewing?: boolean;
  viewingNote?: string;
  extracted?: {
    budgetMax?: number;
    preferredLocation?: string;
    intent?: string;
    bedrooms?: number;
  };
  listings?: Array<{
    listingCode: string;
    title: string;
    location: string;
    price: string;
    currency: string;
  }>;
};

export interface AgentProvider {
  readonly name: string;
  reply(input: {
    phoneE164: string;
    userText: string;
    history?: AgentMessage[];
  }): Promise<AgentReply>;
}
