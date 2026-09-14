import { env } from "../lib/env.js";
import { getLogger } from "../lib/logger.js";
import type {
  InboundEvent,
  OutboundMedia,
  OutboundTemplate,
  OutboundText,
  SendResult,
  WhatsAppProvider,
} from "./types.js";

const log = getLogger({ module: "whatsapp-meta" });
const GRAPH_VERSION = "v21.0";

function accessToken(): string {
  const e = env();
  // Prefer dedicated key; allow secret as fallback if only one was set.
  const token = e.WHATSAPP_API_KEY || e.WHATSAPP_API_SECRET;
  if (!token) {
    throw new Error("Meta WhatsApp requires WHATSAPP_API_KEY (system user token).");
  }
  return token;
}

function phoneNumberId(): string {
  const id = env().WHATSAPP_PHONE_NUMBER_ID;
  if (!id) {
    throw new Error("Meta WhatsApp requires WHATSAPP_PHONE_NUMBER_ID.");
  }
  return id;
}

/** Meta expects digits only (country code + number, no +). */
export function toMetaPhone(to: string): string {
  return to.replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

function mediaKind(url: string): "image" | "document" | "video" | "audio" {
  const lower = url.toLowerCase().split("?")[0] ?? url.toLowerCase();
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return "image";
  if (/\.(mp4|mov|webm)$/.test(lower)) return "video";
  if (/\.(mp3|ogg|opus|aac|m4a)$/.test(lower)) return "audio";
  return "document";
}

function templateBodyParams(
  variables?: Record<string, string>,
): Array<{ type: "text"; text: string }> {
  if (!variables || Object.keys(variables).length === 0) return [];
  const keys = Object.keys(variables);
  const numeric = keys.every((k) => /^\d+$/.test(k));
  const ordered = numeric
    ? keys.sort((a, b) => Number(a) - Number(b))
    : keys;
  return ordered.map((k) => ({ type: "text" as const, text: String(variables[k] ?? "") }));
}

type GraphSendResponse = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string; code?: number };
};

async function graphSend(payload: Record<string, unknown>): Promise<SendResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId()}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      ...payload,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as GraphSendResponse;
  if (!res.ok || data.error) {
    const msg = data.error?.message ?? `Meta Graph HTTP ${res.status}`;
    log.error({ status: res.status, error: data.error }, "Meta send failed");
    throw new Error(msg);
  }

  const id = data.messages?.[0]?.id;
  if (!id) {
    throw new Error("Meta Graph send succeeded but returned no message id");
  }

  return { bspMessageId: id, status: "QUEUED" };
}

function mapStatus(raw: string | undefined): InboundEvent["status"] {
  switch ((raw ?? "").toLowerCase()) {
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "read":
      return "READ";
    case "failed":
      return "FAILED";
    default:
      return "DELIVERED";
  }
}

/**
 * WhatsApp Cloud API (Meta Graph) provider.
 * Uses WHATSAPP_API_KEY (token), WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_WEBHOOK_VERIFY_TOKEN.
 */
export class MetaWhatsApp implements WhatsAppProvider {
  readonly name = "meta";

  async sendText(input: OutboundText): Promise<SendResult> {
    return graphSend({
      to: toMetaPhone(input.to),
      type: "text",
      text: { preview_url: false, body: input.body },
    });
  }

  async sendTemplate(input: OutboundTemplate): Promise<SendResult> {
    const params = templateBodyParams(input.variables);
    const template: Record<string, unknown> = {
      name: input.templateName,
      language: { code: input.language ?? "en" },
    };
    if (params.length) {
      template.components = [{ type: "body", parameters: params }];
    }
    return graphSend({
      to: toMetaPhone(input.to),
      type: "template",
      template,
    });
  }

  async sendMedia(input: OutboundMedia): Promise<SendResult> {
    const kind = mediaKind(input.mediaUrl);
    const mediaPayload: Record<string, unknown> = { link: input.mediaUrl };
    if (input.caption && (kind === "image" || kind === "video" || kind === "document")) {
      mediaPayload.caption = input.caption;
    }
    return graphSend({
      to: toMetaPhone(input.to),
      type: kind,
      [kind]: mediaPayload,
    });
  }

  verifyWebhook(query: Record<string, string | undefined>) {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    const expected = env().WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode === "subscribe" && expected && token === expected && challenge) {
      return { ok: true, challenge };
    }
    return { ok: false };
  }

  parseWebhook(
    body: unknown,
    _headers: Record<string, string | string[] | undefined>,
  ): InboundEvent[] {
    if (!body || typeof body !== "object") return [];
    const payload = body as {
      object?: string;
      entry?: Array<{
        changes?: Array<{
          value?: {
            contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
            messages?: Array<{
              from?: string;
              id?: string;
              timestamp?: string;
              type?: string;
              text?: { body?: string };
              image?: { id?: string; caption?: string };
              document?: { id?: string; caption?: string; filename?: string };
              button?: { text?: string; payload?: string };
              interactive?: {
                button_reply?: { title?: string; id?: string };
                list_reply?: { title?: string; id?: string };
              };
            }>;
            statuses?: Array<{
              id?: string;
              status?: string;
              timestamp?: string;
              recipient_id?: string;
              errors?: Array<{ code?: number; title?: string }>;
            }>;
          };
        }>;
      }>;
    };

    if (payload.object && payload.object !== "whatsapp_business_account") {
      return [];
    }

    const events: InboundEvent[] = [];

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        const profileName = value.contacts?.[0]?.profile?.name;

        for (const msg of value.messages ?? []) {
          if (!msg?.from || !msg.id) continue;
          let bodyText: string | undefined;
          if (msg.type === "text" && msg.text?.body) {
            bodyText = msg.text.body;
          } else if (msg.button?.text || msg.button?.payload) {
            bodyText = msg.button.text ?? msg.button.payload;
          } else if (msg.interactive?.button_reply?.title) {
            bodyText = msg.interactive.button_reply.title;
          } else if (msg.interactive?.list_reply?.title) {
            bodyText = msg.interactive.list_reply.title;
          } else if (msg.image?.caption || msg.document?.caption) {
            bodyText = msg.image?.caption ?? msg.document?.caption ?? "[media]";
          } else if (msg.type === "image" || msg.type === "document") {
            bodyText = "[media]";
          }

          if (!bodyText) continue;

          events.push({
            kind: "message",
            from: msg.from.startsWith("+") ? msg.from : `+${msg.from}`,
            body: bodyText,
            bspMessageId: msg.id,
            profileName,
            timestamp: msg.timestamp
              ? new Date(Number(msg.timestamp) * 1000).toISOString()
              : undefined,
          });
        }

        for (const st of value.statuses ?? []) {
          if (!st?.id) continue;
          events.push({
            kind: "status",
            bspMessageId: st.id,
            status: mapStatus(st.status),
            to: st.recipient_id
              ? st.recipient_id.startsWith("+")
                ? st.recipient_id
                : `+${st.recipient_id}`
              : undefined,
            errorCode: st.errors?.[0]
              ? String(st.errors[0].code ?? st.errors[0].title ?? "FAILED")
              : undefined,
            timestamp: st.timestamp
              ? new Date(Number(st.timestamp) * 1000).toISOString()
              : undefined,
          });
        }
      }
    }

    return events;
  }
}

export function metaCredentialsPresent(): boolean {
  const e = env();
  const token = e.WHATSAPP_API_KEY || e.WHATSAPP_API_SECRET;
  return Boolean(token && e.WHATSAPP_PHONE_NUMBER_ID);
}
