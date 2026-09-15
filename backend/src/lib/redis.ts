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
export function redisConnectionOptions(): {
  maxRetriesPerRequest: number | null;
  enableReadyCheck: boolean;
  lazyConnect: boolean;
  family: number;
  connectTimeout: number;
  retryStrategy: (times: number) => number | null;
} {
  return {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
    // Prefer dual-stack; avoids some Railway/IPv6 connect failures.
    family: 0,
    connectTimeout: 10_000,
    retryStrategy(times) {
      if (times > 20) return null;
      return Math.min(times * 200, 3_000);
    },
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

async function ensureReady(client: Redis): Promise<void> {
  if (client.status === "ready") return;

  if (client.status === "connecting" || client.status === "connect" || client.status === "reconnecting") {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onEnd = () => {
        cleanup();
        reject(new Error("Redis connection closed while connecting"));
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Redis connect timeout"));
      }, 10_000);
      const cleanup = () => {
        clearTimeout(timer);
        client.off("ready", onReady);
        client.off("end", onEnd);
        client.off("error", onError);
      };
      client.once("ready", onReady);
      client.once("end", onEnd);
      client.once("error", onError);
    });
    return;
  }

  // wait | end | close — connect() only valid from wait; recreate if dead
  if (isDead(client)) {
    throw new Error("Redis connection is closed");
  }
  await client.connect();
}

/**
 * Health / readiness ping. Recreates the singleton if the previous socket died
 * (common on Railway after idle disconnects).
 */
export async function pingRedis(): Promise<boolean> {
  let client = getRedis();

  try {
    await ensureReady(client);
    const result = await client.ping();
    return result === "PONG";
  } catch (first) {
    log.warn(
      { err: first instanceof Error ? first.message : first },
      "Redis ping failed; recreating client",
    );
    resetRedis();
    client = getRedis();
    await ensureReady(client);
    const result = await client.ping();
    return result === "PONG";
  }
}
