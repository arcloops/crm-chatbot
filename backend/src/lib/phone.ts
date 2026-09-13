import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Normalize to E.164. Default region BD for local numbers. */
export function normalizePhone(input: string, defaultCountry: "BD" = "BD"): string {
  const trimmed = input.trim();
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) {
    throw new Error(`Invalid phone number: ${input}`);
  }
  return parsed.format("E.164");
}
