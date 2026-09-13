import { cascadeOptIn, cascadeOptOut } from "./suppression.js";
import { normalizePhone } from "./phone.js";

export async function recordConsent(
  phoneOrE164: string,
  action: "opt_in" | "opt_out",
  source: string,
) {
  const phoneE164 = phoneOrE164.startsWith("+")
    ? phoneOrE164
    : normalizePhone(phoneOrE164);

  if (action === "opt_out") {
    return cascadeOptOut(phoneE164, source);
  }

  return cascadeOptIn(phoneE164, source);
}

const STOP_KEYWORDS = new Set(["STOP", "UNSUBSCRIBE", "CANCEL"]);
const START_KEYWORDS = new Set(["START", "SUBSCRIBE", "YES"]);

export function classifyComplianceKeyword(body: string): "stop" | "start" | null {
  const token = body.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (STOP_KEYWORDS.has(token)) return "stop";
  if (START_KEYWORDS.has(token)) return "start";
  return null;
}
