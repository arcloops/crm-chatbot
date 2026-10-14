import { WhatsAppMode } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";
import { MockWhatsApp } from "./mock.js";
import { MetaWhatsApp, metaCredentialsPresent, subscribeAppToWaba } from "./meta.js";
import type { WhatsAppProvider } from "./types.js";

const log = getLogger({ module: "whatsapp" });

export async function getWhatsAppProvider(): Promise<WhatsAppProvider> {
  const settings = await prisma.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      defaultCurrency: "BDT",
      coldLeadDays: 30,
      whatsappMode: WhatsAppMode.MOCK,
    },
  });

  if (settings.whatsappMode === WhatsAppMode.LIVE) {
    if (metaCredentialsPresent()) {
      return new MetaWhatsApp();
    }
    log.warn(
      "whatsappMode=LIVE but Meta credentials missing (WHATSAPP_API_KEY + WHATSAPP_PHONE_NUMBER_ID); using MOCK",
    );
  }

  return new MockWhatsApp();
}

/** Subscribe this app to the WABA so customer replies reach the webhook. */
export async function ensureWhatsAppWebhookSubscription(): Promise<void> {
  const provider = await getWhatsAppProvider();
  if (provider.name !== "meta") return;
  await subscribeAppToWaba();
}

export type { WhatsAppProvider } from "./types.js";
