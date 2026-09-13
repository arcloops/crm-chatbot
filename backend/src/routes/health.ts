import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/db.js";
import { env, isStorageConfigured } from "../lib/env.js";
import { getLogger } from "../lib/logger.js";
import { pingRedis } from "../lib/redis.js";
import { isVercelRuntime } from "../lib/runtime.js";

type CheckStatus = "ok" | "error" | "skipped";

type HealthPayload = {
  status: "ok" | "degraded" | "error";
  phase: string;
  service: string;
  timestamp: string;
  checks: {
    database: { status: CheckStatus; latencyMs?: number; detail?: string };
    redis: { status: CheckStatus; latencyMs?: number; detail?: string };
    storage: { status: CheckStatus; detail?: string };
  };
};

async function healthHandler(_request: FastifyRequest, reply: FastifyReply) {
  const log = getLogger({ route: "health" });
  const started = Date.now();

  const checks: HealthPayload["checks"] = {
    database: { status: "error" },
    redis: { status: "error" },
    storage: {
      status: isStorageConfigured() ? "ok" : "skipped",
      detail: isStorageConfigured()
        ? "credentials present"
        : "S3 not configured (optional in Phase 0)",
    },
  };

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: "error",
      detail: error instanceof Error ? error.message : "database unreachable",
    };
    log.error({ err: error }, "Database health check failed");
  }

  try {
    if (!env().REDIS_URL) {
      checks.redis = {
        status: "skipped",
        detail: "REDIS_URL not set (ok on Vercel; campaigns disabled)",
      };
    } else {
      const redisStart = Date.now();
      const ok = await pingRedis();
      checks.redis = ok
        ? { status: "ok", latencyMs: Date.now() - redisStart }
        : { status: "error", detail: "unexpected PING response" };
    }
  } catch (error) {
    checks.redis = {
      status: "error",
      detail: error instanceof Error ? error.message : "redis unreachable",
    };
    log.error({ err: error }, "Redis health check failed");
  }

  const dbFailed = checks.database.status === "error";
  const redisFailed = checks.redis.status === "error";

  const payload: HealthPayload = {
    status: dbFailed ? "error" : redisFailed ? "degraded" : "ok",
    phase: "10-13",
    service: "backend",
    timestamp: new Date().toISOString(),
    checks,
  };

  // Attach runtime hint without breaking typed payload consumers
  Object.assign(payload, { runtime: isVercelRuntime() ? "vercel" : "node" });

  log.info({ status: payload.status, durationMs: Date.now() - started }, "Health check");

  // Database is required; Redis is optional until campaigns (Phase 7).
  return reply.status(dbFailed ? 503 : 200).send(payload);
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);
};
