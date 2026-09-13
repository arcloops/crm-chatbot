import type { FastifyPluginAsync } from "fastify";
import { campaignsQueueEnabled, isVercelRuntime } from "../lib/runtime.js";

/**
 * Cron stubs for Vercel Cron Jobs.
 * Protect with CRON_SECRET header: Authorization: Bearer <CRON_SECRET>
 */
export const cronRoutes: FastifyPluginAsync = async (app) => {
  app.get("/cron/campaigns/tick", async (request, reply) => {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = request.headers.authorization;
      if (auth !== `Bearer ${secret}`) {
        return reply.status(401).send({ error: "Unauthorized" });
      }
    }

    if (!campaignsQueueEnabled()) {
      return {
        ok: true,
        skipped: true,
        runtime: isVercelRuntime() ? "vercel" : "node",
        reason:
          "Campaign queue is disabled on Vercel. Run a Railway/Fly worker for BullMQ, or implement QStash batch sends.",
      };
    }

    // Non-Vercel: tick is a no-op placeholder (poller already runs in-process).
    return {
      ok: true,
      skipped: false,
      runtime: "node",
      detail: "In-process poller handles scheduled campaigns; cron tick is unused.",
    };
  });
};
