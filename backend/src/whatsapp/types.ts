export type OutboundText = {
  to: string;
  body: string;
};

export type OutboundTemplate = {
  to: string;
  templateName: string;
  language?: string;
  variables?: Record<string, string>;
};

export type OutboundMedia = {
  to: string;
  mediaUrl: string;
  caption?: string;
};

export type SendResult = {
  bspMessageId: string;
  status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED";
};

export type InboundEvent = {
  kind: "message" | "status";
  from?: string;
  to?: string;
  body?: string;
  mediaUrl?: string;
  bspMessageId?: string;
  status?: "SENT" | "DELIVERED" | "READ" | "FAILED";
  errorCode?: string;
  timestamp?: string;
  profileName?: string;
};

export interface WhatsAppProvider {
  readonly name: string;
  sendText(input: OutboundText): Promise<SendResult>;
  sendTemplate(input: OutboundTemplate): Promise<SendResult>;
  sendMedia(input: OutboundMedia): Promise<SendResult>;
  verifyWebhook(query: Record<string, string | undefined>): {
    ok: boolean;
    challenge?: string;
  };
  parseWebhook(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): InboundEvent[];
}
