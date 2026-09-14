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
    budgetMin?: number;
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
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
};

export type AgentReplyInput = {
  phoneE164: string;
  userText: string;
  history?: AgentMessage[];
  channel?: "whatsapp" | "dashboard";
  staffName?: string;
  conversationId?: string;
  prospectId?: string;
  profileName?: string;
};

export interface AgentProvider {
  readonly name: string;
  reply(input: AgentReplyInput): Promise<AgentReply>;
}
