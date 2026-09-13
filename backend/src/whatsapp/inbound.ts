import {
  CampaignRecipientStatus,
  LeadStage,
  MessageDirection,
  MessageStatus,
  MessageType,
  ProspectIntent,
  WhatsAppMode,
} from "@prisma/client";
import { getAgent } from "../agent/index.js";
import { escalateConversation, upsertProspectFromPhone } from "../agent/escalate.js";
import { classifyComplianceKeyword, recordConsent } from "../lib/consent.js";
import { prisma } from "../lib/db.js";
import { windowExpiresFrom } from "../lib/messaging.js";
import { normalizePhone } from "../lib/phone.js";
import { getWhatsAppProvider } from "../whatsapp/index.js";

async function upsertConversation(phoneE164: string, prospectId?: string | null) {
  return prisma.conversation.upsert({
    where: { phoneE164 },
    update: { prospectId: prospectId ?? undefined },
    create: {
      phoneE164,
      prospectId: prospectId ?? null,
    },
  });
}

async function sendBotText(phoneE164: string, body: string, conversationId: string) {
  const provider = await getWhatsAppProvider();
  const result = await provider.sendText({ to: phoneE164, body });
  await prisma.message.create({
    data: {
      conversationId,
      direction: MessageDirection.OUT,
      type: MessageType.TEXT,
      body,
      bspMessageId: result.bspMessageId,
      status: result.status === "FAILED" ? MessageStatus.FAILED : MessageStatus.DELIVERED,
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastOutboundAt: new Date() },
  });
}

/** Shared inbound handler for webhook + mock inbound. */
export async function handleInboundMessage(opts: {
  from: string;
  body: string;
  bspMessageId?: string | null;
  mediaUrl?: string | null;
}) {
  let phoneE164: string;
  try {
    phoneE164 = opts.from.startsWith("+") ? opts.from : normalizePhone(opts.from);
  } catch {
    return { ok: false, error: "Invalid phone" };
  }

  const now = new Date();
  let prospect = await upsertProspectFromPhone(phoneE164, opts.from);
  let conversation = await upsertConversation(phoneE164, prospect.id);

  conversation = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastInboundAt: now,
      windowExpiresAt: windowExpiresFrom(now),
      prospectId: prospect.id,
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: MessageDirection.IN,
      type: opts.mediaUrl ? MessageType.MEDIA : MessageType.TEXT,
      body: opts.body,
      mediaUrl: opts.mediaUrl ?? null,
      bspMessageId: opts.bspMessageId ?? null,
      status: MessageStatus.DELIVERED,
    },
  });

  await prisma.prospect.update({
    where: { id: prospect.id },
    data: {
      lastInteractionDate: now,
      conversationHistoryRef: conversation.id,
    },
  });

  // Mark campaign recipients as replied when inbound matches
  const toReply = await prisma.campaignRecipient.findMany({
    where: {
      phoneE164,
      status: {
        in: [
          CampaignRecipientStatus.SENT,
          CampaignRecipientStatus.DELIVERED,
          CampaignRecipientStatus.QUEUED,
        ],
      },
    },
    select: { id: true, campaignId: true },
  });

  if (toReply.length) {
    await prisma.campaignRecipient.updateMany({
      where: { id: { in: toReply.map((r) => r.id) } },
      data: { status: CampaignRecipientStatus.REPLIED },
    });
    const byCampaign = new Map<string, number>();
    for (const row of toReply) {
      byCampaign.set(row.campaignId, (byCampaign.get(row.campaignId) ?? 0) + 1);
    }
    for (const [campaignId, count] of byCampaign) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { repliedCount: { increment: count } },
      });
    }
  }

  const keyword = classifyComplianceKeyword(opts.body);
  if (keyword === "stop") {
    await recordConsent(phoneE164, "opt_out", "whatsapp_stop");
    await sendBotText(
      phoneE164,
      "You have been unsubscribed. Reply START to opt back in.",
      conversation.id,
    );
    return { ok: true, conversationId: conversation.id, action: "stop", phoneE164 };
  }

  if (keyword === "start") {
    await recordConsent(phoneE164, "opt_in", "whatsapp_start");
    await sendBotText(
      phoneE164,
      "You are opted in again. How can we help with property search?",
      conversation.id,
    );
    return { ok: true, conversationId: conversation.id, action: "start", phoneE164 };
  }

  // Human takeover: skip bot
  if (conversation.humanTakeover || !conversation.botEnabled) {
    return {
      ok: true,
      conversationId: conversation.id,
      action: "queued_for_human",
    };
  }

  const agent = getAgent();
  const reply = await agent.reply({
    phoneE164,
    userText: opts.body,
  });

  if (reply.extracted) {
    prospect = await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        preferredLocation:
          reply.extracted.preferredLocation ?? prospect.preferredLocation,
        budgetMax:
          reply.extracted.budgetMax != null
            ? reply.extracted.budgetMax
            : prospect.budgetMax,
        intent: reply.extracted.intent
          ? (reply.extracted.intent as ProspectIntent)
          : prospect.intent,
        lastInteractionDate: now,
      },
    });
  }

  if (reply.bookViewing) {
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        leadStage: LeadStage.VIEWING_BOOKED,
        viewingAt: now,
        viewingNote: reply.viewingNote ?? opts.body.slice(0, 240),
        lastInteractionDate: now,
      },
    });
  }

  if (reply.escalate) {
    await escalateConversation({
      conversationId: conversation.id,
      prospectId: prospect.id,
      summary: reply.escalationSummary ?? opts.body.slice(0, 200),
      preferredRegion: reply.extracted?.preferredLocation ?? prospect.preferredLocation,
    });
  }

  if (reply.text) {
    const windowOpen =
      conversation.windowExpiresAt && conversation.windowExpiresAt.getTime() > Date.now();
    if (windowOpen) {
      await sendBotText(phoneE164, reply.text, conversation.id);
    } else {
      // Outside window: try template hello_world as fallback notice
      const provider = await getWhatsAppProvider();
      const settings = await prisma.appSettings.findUnique({
        where: { id: "default" },
      });
      if (!settings || settings.whatsappMode === WhatsAppMode.MOCK) {
        const result = await provider.sendTemplate({
          to: phoneE164,
          templateName: "hello_world",
        });
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: MessageDirection.OUT,
            type: MessageType.TEMPLATE,
            body: reply.text,
            templateName: "hello_world",
            bspMessageId: result.bspMessageId,
            status: MessageStatus.DELIVERED,
          },
        });
      }
    }
  }

  return {
    ok: true,
    conversationId: conversation.id,
    action: reply.escalate ? "escalated" : "bot_replied",
  };
}
