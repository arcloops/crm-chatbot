import { prisma } from "./db.js";
import { normalizePhone } from "./phone.js";
import { isPhoneSuppressed } from "./suppression.js";

export type CanMessageResult =
  | { ok: true; phoneE164: string; windowOpen: boolean }
  | { ok: false; phoneE164: string; reason: string };

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(windowExpiresAt: Date | null | undefined): boolean {
  if (!windowExpiresAt) return false;
  return windowExpiresAt.getTime() > Date.now();
}

export function windowExpiresFrom(from: Date = new Date()): Date {
  return new Date(from.getTime() + WINDOW_MS);
}

/** Unified gate: suppression + opt-in + optional 24h window for free-form text. */
export async function canMessage(
  phoneOrE164: string,
  opts: { requireOptIn?: boolean; requireWindowForText?: boolean } = {},
): Promise<CanMessageResult> {
  const phoneE164 = phoneOrE164.startsWith("+")
    ? phoneOrE164
    : normalizePhone(phoneOrE164);

  if (await isPhoneSuppressed(phoneE164)) {
    return { ok: false, phoneE164, reason: "Phone is on the suppression list" };
  }

  if (opts.requireOptIn !== false) {
    const [broker, customer, prospect, developer] = await Promise.all([
      prisma.broker.findUnique({ where: { phoneE164 }, select: { optInStatus: true } }),
      prisma.customer.findUnique({
        where: { phoneE164 },
        select: { optInStatus: true },
      }),
      prisma.prospect.findUnique({
        where: { phoneE164 },
        select: { optInStatus: true },
      }),
      prisma.developer.findUnique({
        where: { phoneE164 },
        select: { optInStatus: true },
      }),
    ]);
    const contacts = [broker, customer, prospect, developer].filter(Boolean);
    if (contacts.length > 0 && contacts.every((c) => c && !c.optInStatus)) {
      return { ok: false, phoneE164, reason: "Contact has opted out" };
    }
  }

  const conversation = await prisma.conversation.findUnique({
    where: { phoneE164 },
    select: { windowExpiresAt: true },
  });
  const windowOpen = isWindowOpen(conversation?.windowExpiresAt);

  if (opts.requireWindowForText && !windowOpen) {
    return {
      ok: false,
      phoneE164,
      reason: "24-hour session window closed. Send a TEMPLATE instead.",
    };
  }

  return { ok: true, phoneE164, windowOpen };
}

export async function assertCanMessage(
  phoneOrE164: string,
  opts: { requireOptIn?: boolean; requireWindowForText?: boolean } = {},
): Promise<{ phoneE164: string; windowOpen: boolean }> {
  const result = await canMessage(phoneOrE164, opts);
  if (!result.ok) throw new Error(result.reason);
  return { phoneE164: result.phoneE164, windowOpen: result.windowOpen };
}
