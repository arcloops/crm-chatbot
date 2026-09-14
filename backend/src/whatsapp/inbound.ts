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
import type { AgentMessage } from "../agent/types.js";
import { classifyComplianceKeyword, recordConsent } from "../lib/consent.js";
import { prisma } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";
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

async function loadHistory(conversationId: string): Promise<AgentMessage[]> {
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      body: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { direction: true, body: true },
  });
  return rows
    .reverse()
    .filter((m) => m.body && m.body.trim())
    .map((m) => ({
      role: m.direction === MessageDirection.IN ? ("user" as const) : ("assistant" as const),
      content: m.body!,
    }));
}

/** Shared inbound handler for webhook + mock inbound. */
export async function handleInboundMessage(opts: {
  from: string;
  body: string;
  bspMessageId?: string | null;
  mediaUrl?: string | null;
  profileName?: string | null;
}) {
  let phoneE164: string;
  try {
    phoneE164 = opts.from.startsWith("+") ? opts.from : normalizePhone(opts.from);
  } catch {
    return { ok: false, error: "Invalid phone" };
  }

  const now = new Date();
  let prospect = await upsertProspectFromPhone(phoneE164, opts.from, {
    name: opts.profileName?.trim() || undefined,
  });
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
      ...(opts.profileName?.trim() && prospect.name.startsWith("WhatsApp ")
        ? { name: opts.profileName.trim() }
        : {}),
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

  const history = await loadHistory(conversation.id);
  // Exclude the message we just stored so the agent sees prior turns + current as userText
  const priorHistory =
    history.length && history[history.length - 1]?.content === opts.body
      ? history.slice(0, -1)
      : history;

  const agent = getAgent();
  const reply = await agent.reply({
    phoneE164,
    userText: opts.body,
    history: priorHistory,
    channel: "whatsapp",
    conversationId: conversation.id,
    prospectId: prospect.id,
    profileName: opts.profileName?.trim() || undefined,
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
        budgetMin:
          reply.extracted.budgetMin != null
            ? reply.extracted.budgetMin
            : prospect.budgetMin,
        intent: reply.extracted.intent
          ? (reply.extracted.intent as ProspectIntent)
          : prospect.intent,
        lastInteractionDate: now,
      },
    });
  }

  // Tool executors may already have set viewing / escalate; keep inbound sync for flags
  if (reply.bookViewing && !reply.viewingNote?.includes("LST-")) {
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
    const fresh = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      select: { humanTakeover: true },
    });
    if (fresh && !fresh.humanTakeover) {
      const escalated = await escalateConversation({
        conversationId: conversation.id,
        prospectId: prospect.id,
        summary: reply.escalationSummary ?? opts.body.slice(0, 200),
        preferredRegion: reply.extracted?.preferredLocation ?? prospect.preferredLocation,
      });
      getLogger({ route: "whatsapp/inbound" }).info(
        {
          conversationId: conversation.id,
          brokerId: escalated.broker?.id,
          brokerName: escalated.broker?.name,
        },
        "Broker handoff notification (stub)",
      );
    }
  }

  if (reply.text) {
    const windowOpen =
      conversation.windowExpiresAt && conversation.windowExpiresAt.getTime() > Date.now();
    if (windowOpen) {
      await sendBotText(phoneE164, reply.text, conversation.id);
    } else {
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
    toolCalls: reply.toolCalls,
  };
}
