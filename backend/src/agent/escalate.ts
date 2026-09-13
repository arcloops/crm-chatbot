import { ActiveStatus, LeadStage } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { nextCode } from "../lib/ids.js";

export async function escalateConversation(opts: {
  conversationId: string;
  prospectId?: string | null;
  summary: string;
  preferredRegion?: string | null;
}) {
  // Prefer broker by region, else round-robin least-assigned active broker
  let broker = opts.preferredRegion
    ? await prisma.broker.findFirst({
        where: {
          activeStatus: ActiveStatus.ACTIVE,
          regionArea: {
            contains: opts.preferredRegion,
            mode: "insensitive",
          },
        },
        orderBy: { updatedAt: "asc" },
      })
    : null;

  if (!broker) {
    const brokers = await prisma.broker.findMany({
      where: { activeStatus: ActiveStatus.ACTIVE },
      include: { _count: { select: { prospects: true } } },
      orderBy: { prospects: { _count: "asc" } },
      take: 1,
    });
    broker = brokers[0] ?? null;
  }

  const conversation = await prisma.conversation.update({
    where: { id: opts.conversationId },
    data: {
      humanTakeover: true,
      botEnabled: false,
      escalatedAt: new Date(),
      escalationSummary: opts.summary,
    },
  });

  if (opts.prospectId && broker) {
    await prisma.prospect.update({
      where: { id: opts.prospectId },
      data: {
        assignedBrokerId: broker.id,
        leadStage: LeadStage.QUALIFIED,
        lastInteractionDate: new Date(),
      },
    });
  }

  return { conversation, broker };
}

export async function upsertProspectFromPhone(
  phoneE164: string,
  phoneRaw: string,
  patch: {
    preferredLocation?: string;
    budgetMax?: number;
    intent?: string;
    leadSource?: string;
  } = {},
) {
  const existing = await prisma.prospect.findUnique({ where: { phoneE164 } });
  if (existing) {
    return prisma.prospect.update({
      where: { id: existing.id },
      data: {
        preferredLocation: patch.preferredLocation ?? existing.preferredLocation,
        budgetMax: patch.budgetMax != null ? patch.budgetMax : existing.budgetMax,
        intent: (patch.intent as never) ?? existing.intent,
        lastInteractionDate: new Date(),
      },
    });
  }

  const prospectCode = await nextCode("PRS", "prospect");
  return prisma.prospect.create({
    data: {
      prospectCode,
      name: `WhatsApp ${phoneE164}`,
      phone: phoneRaw,
      phoneE164,
      preferredLocation: patch.preferredLocation ?? null,
      budgetMax: patch.budgetMax ?? null,
      intent: (patch.intent as never) ?? null,
      leadSource: patch.leadSource ?? "whatsapp_bot",
      leadStage: LeadStage.NEW,
      lastInteractionDate: new Date(),
      optInStatus: true,
      optInAt: new Date(),
      optInSource: "whatsapp_inbound",
      tags: ["bot"],
    },
  });
}
