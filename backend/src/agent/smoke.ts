/**
 * Smoke checks for agent tool alignment (no Anthropic key required).
 * Run: npx tsx src/agent/smoke.ts (from backend, with .env)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { MockAgent } from "./mock.js";
import { searchListings } from "./tools.js";
import { prisma } from "../lib/db.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(backendDir, "../.env") });
dotenv.config({ path: path.join(backendDir, ".env") });

async function main() {
  const phone = `+8801999${String(Date.now()).slice(-6)}`;
  const agent = new MockAgent();

  // under 80 lakh → max_price filter via search
  const underLakh = await searchListings({
    location: "Banani",
    budgetMax: 8_000_000,
    intent: "buy",
  });
  console.log("search under 80 lakh Banani buy:", underLakh.length, "hits");

  // empty-ish widen criteria path
  const empty = await searchListings({
    location: "ZZZ-NoSuchArea",
    budgetMax: 1,
  });
  console.log("empty search:", empty.length === 0 ? "OK" : "UNEXPECTED");

  const conv = await prisma.conversation.create({
    data: { phoneE164: phone },
  });

  const escalate = await agent.reply({
    phoneE164: phone,
    userText: "Please talk to a broker about the contract",
    conversationId: conv.id,
    channel: "whatsapp",
    profileName: "Smoke Tester",
  });
  console.log(
    "handoff:",
    escalate.escalate ? "OK" : "FAIL",
    escalate.toolCalls?.map((t) => t.name).join(",") ?? "",
  );

  // reset takeover for viewing test on fresh conversation
  const phone2 = `+8801888${String(Date.now()).slice(-6)}`;
  const listing = await prisma.listing.findFirst({
    where: { archivedAt: null },
    select: { listingCode: true },
  });
  if (!listing) throw new Error("No listing seeded");

  const viewing = await agent.reply({
    phoneE164: phone2,
    userText: `I want to schedule a viewing for ${listing.listingCode}`,
    channel: "whatsapp",
    profileName: "Viewer Smoke",
  });
  console.log(
    "viewing:",
    viewing.bookViewing ? "OK" : "FAIL",
    viewing.toolCalls?.map((t) => t.name).join(",") ?? "",
    viewing.text.slice(0, 80),
  );

  const multi = await agent.reply({
    phoneE164: phone2,
    userText: "2 bed in Gulshan under 90 lakh",
    history: [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "How can I help?" },
    ],
    channel: "whatsapp",
  });
  console.log(
    "multi-turn search tools:",
    multi.toolCalls?.map((t) => t.name).join(",") ?? "none",
    "listings",
    multi.listings?.length ?? 0,
  );

  console.log("Smoke complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
