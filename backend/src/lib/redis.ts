import { Redis } from "ioredis";
import { env } from "./env.js";
import { getLogger } from "./logger.js";

const log = getLogger({ module: "redis" });

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function redisUrl(): string {
  return env().REDIS_URL;
}

/** Shared ioredis options that work with Railway Redis (incl. rediss:// TLS). */
export function redisConnectionOptions(overrides?: {
  maxRetriesPerRequest?: number | null;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}): Record<string, unknown> {
  return {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
    // Prefer dual-stack; avoids some Railway/IPv6 connect failures.
    family: 0,
    connectTimeout: 10_000,
    keepAlive: 10_000,
    retryStrategy(times: number) {
      if (times > 20) return null;
      return Math.min(times * 200, 3_000);
    },
    ...overrides,
  };
}

function createRedisClient(): Redis {
  const client = new Redis(redisUrl(), redisConnectionOptions());

  client.on("error", (err) => {
    log.warn({ err: err.message }, "Redis client error");
  });

  return client;
}

function isDead(client: Redis): boolean {
  return client.status === "end" || client.status === "close";
}

export function resetRedis(): void {
  const existing = globalForRedis.redis;
  if (!existing) return;
  globalForRedis.redis = undefined;
  try {
    existing.disconnect(false);
  } catch {
    /* ignore */
  }
}

export function getRedis(): Redis {
  if (!globalForRedis.redis || isDead(globalForRedis.redis)) {
    if (globalForRedis.redis && isDead(globalForRedis.redis)) {
      resetRedis();
    }
    globalForRedis.redis = createRedisClient();
  }
  return globalForRedis.redis;
}

/** Safe diagnostics for /health (no password). */
export function redisDiagnostics(): {
  configured: boolean;
  tls: boolean;
  host?: string;
  port?: string;
  parseError?: boolean;
} {
  const raw = redisUrl();
  if (!raw) return { configured: false, tls: false };
  try {
    const normalized = raw.replace(/^rediss?:\/\//i, (m) =>
      m.toLowerCase().startsWith("rediss") ? "https://" : "http://",
    );
    const u = new URL(normalized);
    return {
      configured: true,
      tls: /^rediss:/i.test(raw),
      host: u.hostname || undefined,
      port: u.port || ( /^rediss:/i.test(raw) ? "6380" : "6379"),
    };
  } catch {
    return { configured: true, tls: /^rediss:/i.test(raw), parseError: true };
  }
}

/**
 * Health ping using a fresh short-lived client so a dead singleton cannot
 * poison /health forever (common when REDIS_URL is wrong or Redis is down).
 */
export async function pingRedis(): Promise<boolean> {
  const probe = new Redis(
    redisUrl(),
    redisConnectionOptions({
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: true,
    }),
  );

  try {
    await probe.connect();
    const result = await probe.ping();
    // Refresh shared singleton after a successful probe.
    resetRedis();
    globalForRedis.redis = createRedisClient();
    return result === "PONG";
  } catch (err) {
    log.warn(
      {
        err: err instanceof Error ? err.message : err,
        ...redisDiagnostics(),
      },
      "Redis ping failed",
    );
    throw err;
  } finally {
    try {
      probe.disconnect(false);
    } catch {
      /* ignore */
    }
  }
}
