import { prisma } from "./db.js";
import { normalizePhone } from "./phone.js";

export async function isPhoneSuppressed(phoneOrE164: string): Promise<boolean> {
  const phoneE164 = phoneOrE164.startsWith("+")
    ? phoneOrE164
    : normalizePhone(phoneOrE164);
  const entry = await prisma.suppressionEntry.findUnique({
    where: { phoneE164 },
  });
  return Boolean(entry);
}

/** Hard gate for future campaign sends (Phase 7). */
export async function assertNotSuppressed(phoneOrE164: string): Promise<void> {
  if (await isPhoneSuppressed(phoneOrE164)) {
    throw new Error("Phone is on the suppression list");
  }
}

export async function syncOptOutToSuppression(
  phoneOrE164: string,
  source: string,
): Promise<void> {
  const phoneE164 = phoneOrE164.startsWith("+")
    ? phoneOrE164
    : normalizePhone(phoneOrE164);
  await prisma.suppressionEntry.upsert({
    where: { phoneE164 },
    update: { source, optedOutDate: new Date() },
    create: { phoneE164, source, optedOutDate: new Date() },
  });
}

export type CascadeResult = {
  phoneE164: string;
  brokersUpdated: number;
  customersUpdated: number;
  prospectsUpdated: number;
  developersUpdated: number;
};

/** Suppress phone and clear opt-in across all contact lists. */
export async function cascadeOptOut(
  phoneOrE164: string,
  source: string,
): Promise<CascadeResult> {
  const phoneE164 = phoneOrE164.startsWith("+")
    ? phoneOrE164
    : normalizePhone(phoneOrE164);

  await syncOptOutToSuppression(phoneE164, source);

  const now = new Date();
  const [brokers, customers, prospects, developers] = await Promise.all([
    prisma.broker.updateMany({
      where: { phoneE164 },
      data: {
        optInStatus: false,
        optOutAt: now,
        optOutSource: source,
      },
    }),
    prisma.customer.updateMany({
      where: { phoneE164 },
      data: {
        optInStatus: false,
        optOutAt: now,
        optOutSource: source,
      },
    }),
    prisma.prospect.updateMany({
      where: { phoneE164 },
      data: {
        optInStatus: false,
        optOutAt: now,
        optOutSource: source,
      },
    }),
    prisma.developer.updateMany({
      where: { phoneE164 },
      data: {
        optInStatus: false,
        optOutAt: now,
        optOutSource: source,
      },
    }),
  ]);

  await prisma.consentEvent.create({
    data: { phoneE164, action: "opt_out", source },
  });

  return {
    phoneE164,
    brokersUpdated: brokers.count,
    customersUpdated: customers.count,
    prospectsUpdated: prospects.count,
    developersUpdated: developers.count,
  };
}

/** Remove suppression and restore opt-in across all contact lists. */
export async function cascadeOptIn(
  phoneOrE164: string,
  source: string,
): Promise<CascadeResult & { restored: true }> {
  const phoneE164 = phoneOrE164.startsWith("+")
    ? phoneOrE164
    : normalizePhone(phoneOrE164);

  await prisma.suppressionEntry.deleteMany({ where: { phoneE164 } });

  const now = new Date();
  const [brokers, customers, prospects, developers] = await Promise.all([
    prisma.broker.updateMany({
      where: { phoneE164 },
      data: {
        optInStatus: true,
        optInAt: now,
        optInSource: source,
        optOutAt: null,
        optOutSource: null,
      },
    }),
    prisma.customer.updateMany({
      where: { phoneE164 },
      data: {
        optInStatus: true,
        optInAt: now,
        optInSource: source,
        optOutAt: null,
        optOutSource: null,
      },
    }),
    prisma.prospect.updateMany({
      where: { phoneE164 },
      data: {
        optInStatus: true,
        optInAt: now,
        optInSource: source,
        optOutAt: null,
        optOutSource: null,
      },
    }),
    prisma.developer.updateMany({
      where: { phoneE164 },
      data: {
        optInStatus: true,
        optInAt: now,
        optInSource: source,
        optOutAt: null,
        optOutSource: null,
      },
    }),
  ]);

  await prisma.consentEvent.create({
    data: { phoneE164, action: "opt_in", source },
  });

  return {
    phoneE164,
    brokersUpdated: brokers.count,
    customersUpdated: customers.count,
    prospectsUpdated: prospects.count,
    developersUpdated: developers.count,
    restored: true,
  };
}
