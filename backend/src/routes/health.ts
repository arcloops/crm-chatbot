import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/db.js";
import { isStorageConfigured } from "../lib/env.js";
import { getLogger } from "../lib/logger.js";
import { pingRedis, redisDiagnostics } from "../lib/redis.js";

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
    const redisStart = Date.now();
    const ok = await pingRedis();
    checks.redis = ok
      ? { status: "ok", latencyMs: Date.now() - redisStart }
      : { status: "error", detail: "unexpected PING response" };
  } catch (error) {
    const diag = redisDiagnostics();
    const msg = error instanceof Error ? error.message : "redis unreachable";
    const where = diag.parseError
      ? "REDIS_URL unparseable"
      : diag.host
        ? `${diag.tls ? "rediss" : "redis"}://${diag.host}:${diag.port}`
        : "REDIS_URL missing/invalid";
    checks.redis = {
      status: "error",
      detail: `${msg} (${where})`,
    };
    log.error({ err: error, redis: diag }, "Redis health check failed");
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

  log.info({ status: payload.status, durationMs: Date.now() - started }, "Health check");

  // Database is required; Redis is optional until campaigns (Phase 7).
  return reply.status(dbFailed ? 503 : 200).send(payload);
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);
};
