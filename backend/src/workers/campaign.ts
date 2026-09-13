import {
  CampaignRecipientStatus,
  CampaignStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
} from "@prisma/client";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "../lib/db.js";
import { requireRedisUrl } from "../lib/env.js";
import { getLogger } from "../lib/logger.js";
import { campaignsQueueEnabled } from "../lib/runtime.js";
import { getWhatsAppProvider } from "../whatsapp/index.js";

const log = getLogger({ module: "campaign-worker" });

const QUEUE_NAME = "campaign-sends";

let queueConnection: Redis | null = null;
let workerConnection: Redis | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;

function createRedis(): Redis {
  return new Redis(requireRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function getCampaignQueue(): Queue {
  if (!queue) {
    queueConnection = createRedis();
    queue = new Queue(QUEUE_NAME, { connection: queueConnection });
  }
  return queue;
}

export type CampaignJobData = {
  campaignId: string;
  recipientId: string;
};

async function processSend(data: CampaignJobData) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: data.campaignId },
  });
  if (!campaign) return;
  if (
    campaign.status === CampaignStatus.PAUSED ||
    campaign.status === CampaignStatus.CANCELLED
  ) {
    return;
  }

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: data.recipientId },
  });
  if (!recipient || recipient.status === CampaignRecipientStatus.SKIPPED) {
    return;
  }

  const templateName = recipient.templateName ?? campaign.templateName;
  const provider = await getWhatsAppProvider();

  try {
    const result = await provider.sendTemplate({
      to: recipient.phoneE164,
      templateName,
      variables: (recipient.mergePayload as Record<string, string>) ?? {},
    });

    const conversation = await prisma.conversation.upsert({
      where: { phoneE164: recipient.phoneE164 },
      update: { lastOutboundAt: new Date() },
      create: {
        phoneE164: recipient.phoneE164,
        lastOutboundAt: new Date(),
      },
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUT,
        type: MessageType.TEMPLATE,
        body: `[campaign:${campaign.name}][template:${templateName}]`,
        templateName,
        bspMessageId: result.bspMessageId,
        status:
          result.status === "FAILED"
            ? MessageStatus.FAILED
            : result.status === "QUEUED"
              ? MessageStatus.QUEUED
              : MessageStatus.DELIVERED,
      },
    });

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status:
          result.status === "FAILED"
            ? CampaignRecipientStatus.FAILED
            : CampaignRecipientStatus.DELIVERED,
        bspMessageId: result.bspMessageId,
        messageId: message.id,
        sentAt: new Date(),
        errorCode: result.status === "FAILED" ? "SEND_FAILED" : null,
      },
    });

    if (result.status === "FAILED") {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { failedCount: { increment: 1 } },
      });
    } else {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          sentCount: { increment: 1 },
          deliveredCount: { increment: 1 },
        },
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "send_failed";
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: CampaignRecipientStatus.FAILED,
        errorCode: msg.slice(0, 120),
      },
    });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { failedCount: { increment: 1 } },
    });
    log.error({ err: error, recipientId: recipient.id }, "Campaign send failed");
  }

  await maybeCompleteCampaign(campaign.id);
}

async function maybeCompleteCampaign(campaignId: string) {
  const pending = await prisma.campaignRecipient.count({
    where: {
      campaignId,
      status: {
        in: [CampaignRecipientStatus.PENDING, CampaignRecipientStatus.QUEUED],
      },
    },
  });
  if (pending > 0) return;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== CampaignStatus.RUNNING) return;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: CampaignStatus.COMPLETED,
      completedAt: new Date(),
    },
  });
}

export function startCampaignWorker() {
  if (!campaignsQueueEnabled()) {
    log.warn("Skipping campaign worker (disabled on this runtime)");
    return null;
  }
  if (worker) return worker;

  workerConnection = createRedis();
  worker = new Worker<CampaignJobData>(QUEUE_NAME, async (job) => processSend(job.data), {
    connection: workerConnection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "Campaign job failed");
  });
  worker.on("error", (err) => {
    log.error({ err }, "Campaign worker error");
  });

  log.info("Campaign worker started");
  return worker;
}

export async function enqueueCampaignRecipients(
  campaignId: string,
  recipientIds: string[],
  rateLimitPerSec: number,
) {
  if (!campaignsQueueEnabled()) {
    throw new Error(
      "Campaign sending is disabled on Vercel. Deploy the API worker on Railway/Fly, or use a queue provider.",
    );
  }
  const q = getCampaignQueue();
  const limiterMax = Math.max(1, rateLimitPerSec);

  const jobs = recipientIds.map((recipientId, index) => ({
    name: "send",
    data: { campaignId, recipientId },
    opts: {
      jobId: `${campaignId}-${recipientId}`,
      attempts: 3,
      backoff: { type: "exponential" as const, delay: 2000 },
      delay: Math.floor(index / limiterMax) * 1000,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  }));

  if (jobs.length) await q.addBulk(jobs);
}

export async function stopCampaignJobs(campaignId: string) {
  if (!campaignsQueueEnabled()) return;
  const q = getCampaignQueue();
  const jobs = await q.getJobs(["waiting", "delayed"]);
  for (const job of jobs) {
    if (job.data?.campaignId === campaignId) {
      await job.remove();
    }
  }
}
