import { WhatsAppMode } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { env } from "../lib/env.js";
import { MockWhatsApp, TwilioWhatsAppStub } from "./mock.js";
import type { WhatsAppProvider } from "./types.js";

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
    const e = env();
    if (e.WHATSAPP_API_KEY && e.WHATSAPP_API_SECRET) {
      // Stub until a real Twilio adapter is wired
      return new TwilioWhatsAppStub();
    }
  }

  return new MockWhatsApp();
}

export type { WhatsAppProvider } from "./types.js";
