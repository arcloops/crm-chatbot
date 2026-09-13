import { randomUUID } from "node:crypto";
import type {
  InboundEvent,
  OutboundMedia,
  OutboundTemplate,
  OutboundText,
  SendResult,
  WhatsAppProvider,
} from "./types.js";

/** In-memory mock BSP for local/dev without credentials. */
export class MockWhatsApp implements WhatsAppProvider {
  readonly name = "mock";

  async sendText(_input: OutboundText): Promise<SendResult> {
    return {
      bspMessageId: `mock_out_${randomUUID()}`,
      status: "DELIVERED",
    };
  }

  async sendTemplate(_input: OutboundTemplate): Promise<SendResult> {
    return {
      bspMessageId: `mock_tpl_${randomUUID()}`,
      status: "DELIVERED",
    };
  }

  async sendMedia(_input: OutboundMedia): Promise<SendResult> {
    return {
      bspMessageId: `mock_media_${randomUUID()}`,
      status: "DELIVERED",
    };
  }

  verifyWebhook(query: Record<string, string | undefined>) {
    const mode = query["hub.mode"];
    const challenge = query["hub.challenge"];
    if (mode === "subscribe" && challenge) {
      return { ok: true, challenge };
    }
    // Mock always accepts verify token when present
    if (query["hub.verify_token"] || challenge) {
      return { ok: true, challenge: challenge ?? "mock_ok" };
    }
    return { ok: true, challenge: "mock_ok" };
  }

  parseWebhook(
    body: unknown,
    _headers: Record<string, string | string[] | undefined>,
  ): InboundEvent[] {
    if (!body || typeof body !== "object") return [];
    const payload = body as Record<string, unknown>;

    if (payload.kind === "status" && typeof payload.bspMessageId === "string") {
      return [
        {
          kind: "status",
          bspMessageId: payload.bspMessageId,
          status: (payload.status as InboundEvent["status"]) ?? "DELIVERED",
          errorCode:
            typeof payload.errorCode === "string" ? payload.errorCode : undefined,
        },
      ];
    }

    if (typeof payload.from === "string" && typeof payload.body === "string") {
      return [
        {
          kind: "message",
          from: payload.from,
          body: payload.body,
          mediaUrl: typeof payload.mediaUrl === "string" ? payload.mediaUrl : undefined,
          bspMessageId:
            typeof payload.bspMessageId === "string"
              ? payload.bspMessageId
              : `mock_in_${randomUUID()}`,
          timestamp: new Date().toISOString(),
        },
      ];
    }

    return [];
  }
}

export class TwilioWhatsAppStub implements WhatsAppProvider {
  readonly name = "twilio";

  private notConfigured(): never {
    throw new Error(
      "Twilio WhatsApp is not configured. Set WHATSAPP_* credentials and whatsappMode=LIVE.",
    );
  }

  async sendText(): Promise<SendResult> {
    this.notConfigured();
  }
  async sendTemplate(): Promise<SendResult> {
    this.notConfigured();
  }
  async sendMedia(): Promise<SendResult> {
    this.notConfigured();
  }
  verifyWebhook() {
    return { ok: false };
  }
  parseWebhook(): InboundEvent[] {
    this.notConfigured();
  }
}
