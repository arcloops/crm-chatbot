import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./lib/env.js";
import { getLogger } from "./lib/logger.js";
import { initSentry, captureException } from "./lib/sentry.js";
import { campaignsQueueEnabled, isVercelRuntime } from "./lib/runtime.js";
import { agentRoutes } from "./routes/agent.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { authRoutes } from "./routes/auth.js";
import { brokerRoutes } from "./routes/brokers.js";
import { campaignRoutes, pollScheduledCampaigns } from "./routes/campaigns.js";
import { cronRoutes } from "./routes/cron.js";
import { customerRoutes } from "./routes/customers.js";
import { developerRoutes } from "./routes/developers.js";
import { healthRoutes } from "./routes/health.js";
import { inboxRoutes } from "./routes/inbox.js";
import { importRoutes } from "./routes/import.js";
import { lifecycleRoutes } from "./routes/lifecycle.js";
import { listingRoutes } from "./routes/listings.js";
import { privacyRoutes } from "./routes/privacy.js";
import { prospectRoutes } from "./routes/prospects.js";
import { searchRoutes, settingsRoutes } from "./routes/settings.js";
import { staffRoutes } from "./routes/staff.js";
import { statsRoutes } from "./routes/stats.js";
import { contactUtilityRoutes, suppressionRoutes } from "./routes/suppression.js";
import { whatsappRoutes } from "./routes/whatsapp.js";
import { startCampaignWorker } from "./workers/campaign.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(rootDir, ".env") });

/** Build the Fastify app (shared by local Node + Vercel Functions). */
export async function createApp() {
  const config = env();
  initSentry();
  const log = getLogger({ module: "server" });

  const app = Fastify({
    logger: false,
  });

  app.setErrorHandler((error, _request, reply) => {
    captureException(error);
    log.error({ err: error }, "Unhandled error");
    const statusCode =
      typeof error === "object" &&
      error &&
      "statusCode" in error &&
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    reply.status(statusCode).send({
      error:
        statusCode >= 500
          ? "Internal Server Error"
          : error instanceof Error
            ? error.message
            : "Error",
    });
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(",").map((value) => value.trim()),
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(staffRoutes);
  await app.register(listingRoutes);
  await app.register(lifecycleRoutes);
  await app.register(brokerRoutes);
  await app.register(customerRoutes);
  await app.register(prospectRoutes);
  await app.register(developerRoutes);
  await app.register(suppressionRoutes);
  await app.register(contactUtilityRoutes);
  await app.register(statsRoutes);
  await app.register(analyticsRoutes);
  await app.register(settingsRoutes);
  await app.register(searchRoutes);
  await app.register(whatsappRoutes);
  await app.register(campaignRoutes);
  await app.register(inboxRoutes);
  await app.register(agentRoutes);
  await app.register(privacyRoutes);
  await app.register(cronRoutes);
  await app.register(importRoutes);

  app.get("/", async () => ({
    name: "crm-backend",
    phase: "10-13",
    health: "/health",
    runtime: isVercelRuntime() ? "vercel" : "node",
    campaigns: {
      queueEnabled: campaignsQueueEnabled(),
      mode: campaignsQueueEnabled() ? "bullmq" : "disabled_on_vercel",
    },
  }));

  return app;
}

const app = await createApp();

/**
 * Vercel zero-config Fastify entrypoint (`src/app.ts`).
 * Locally we also listen here when not running on Vercel.
 */
export default app;

if (!isVercelRuntime()) {
  const config = env();
  const log = getLogger({ module: "server" });

  if (campaignsQueueEnabled()) {
    try {
      startCampaignWorker();
      setInterval(() => {
        void pollScheduledCampaigns();
      }, 30_000);
    } catch (error) {
      log.warn({ err: error }, "Campaign worker failed to start (Redis?)");
    }
  } else {
    log.warn("Campaign queue disabled");
  }

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info({ port: config.PORT }, "Backend listening");
}
